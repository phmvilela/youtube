package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"cloud.google.com/go/compute/metadata"
	"cloud.google.com/go/firestore"
	"cloud.google.com/go/storage"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/iterator"
)

var (
	firestoreClient *firestore.Client
	storageClient   *storage.Client
	firebaseAuth    *auth.Client
	gcsBucket       string
	databaseID      string
)

func main() {
	ctx := context.Background()

	gcsBucket = os.Getenv("GCS_BUCKET_NAME")
	if gcsBucket == "" {
		gcsBucket = "youtube-kids-462502-videos"
	}
	databaseID = os.Getenv("FIRESTORE_DATABASE_ID")
	if databaseID == "" {
		databaseID = "youtube-kids"
	}

	// Initialize Firebase
	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		log.Fatalf("firebase.NewApp: %v", err)
	}

	firebaseAuth, err = app.Auth(ctx)
	if err != nil {
		log.Fatalf("app.Auth: %v", err)
	}

	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if projectID == "" {
		projectID, err = metadata.ProjectIDWithContext(ctx)
		if err != nil {
			log.Fatalf("could not determine project ID: %v", err)
		}
	}

	firestoreClient, err = firestore.NewClientWithDatabase(ctx, projectID, databaseID)
	if err != nil {
		log.Fatalf("firestore.NewClient: %v", err)
	}
	defer firestoreClient.Close()

	storageClient, err = storage.NewClient(ctx)
	if err != nil {
		log.Fatalf("storage.NewClient: %v", err)
	}
	defer storageClient.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/search", handleSearch)

	log.Printf("search-service listening on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleSearch(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ctx := r.Context()

	// Authenticate
	uid, err := verifyToken(ctx, r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse query
	q := r.URL.Query().Get("q")
	if q == "" {
		http.Error(w, "Missing query parameter 'q'", http.StatusBadRequest)
		return
	}

	queryWords := tokenize(q)
	if len(queryWords) == 0 {
		http.Error(w, "Empty query", http.StatusBadRequest)
		return
	}

	// Set up streaming response
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	// Send status: loading channels
	writeEvent(w, flusher, StatusEvent{Status: "loading_channels"})

	// Get allowed channel IDs from Firestore
	channelIDs, err := getActiveChannelIDs(ctx, uid)
	if err != nil {
		writeEvent(w, flusher, ErrorEvent{Error: fmt.Sprintf("Failed to load channels: %v", err)})
		return
	}

	if len(channelIDs) == 0 {
		writeEvent(w, flusher, StatusEvent{Status: "no_channels"})
		writeEvent(w, flusher, DoneEvent{Total: 0})
		return
	}

	// Send status: searching
	writeEvent(w, flusher, StatusEvent{
		Status:   "searching",
		Channels: len(channelIDs),
	})

	// Read all protobuf batches from GCS and filter
	var allMatches []rankedVideo
	channelsSearched := 0

	for _, chID := range channelIDs {
		videos, err := readChannelVideos(ctx, chID)
		if err != nil {
			log.Printf("Error reading channel %s: %v", chID, err)
			continue
		}

		for _, v := range videos {
			if matchesQuery(v, queryWords) {
				rv := rankVideo(v, queryWords)
				allMatches = append(allMatches, rv)
			}
		}

		channelsSearched++
		writeEvent(w, flusher, ProgressEvent{
			Status:       "progress",
			Searched:     channelsSearched,
			Total:        len(channelIDs),
			MatchesSoFar: len(allMatches),
		})
	}

	// Rank results
	sortRankedVideos(allMatches)

	// Stream ranked results
	for _, rv := range allMatches {
		writeEvent(w, flusher, VideoEvent{
			Type:        "video",
			VideoId:     rv.video.VideoId,
			Title:       rv.video.Title,
			ChannelName: rv.video.ChannelName,
			ChannelId:   rv.video.ChannelId,
			PublishedAt: rv.video.PublishedAt,
			Thumbnail:   rv.video.Thumbnail,
		})
	}

	writeEvent(w, flusher, DoneEvent{Status: "done", Total: len(allMatches)})
}

func verifyToken(ctx context.Context, r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return "", fmt.Errorf("missing bearer token")
	}
	idToken := strings.TrimPrefix(authHeader, "Bearer ")
	token, err := firebaseAuth.VerifyIDToken(ctx, idToken)
	if err != nil {
		return "", err
	}
	return token.UID, nil
}

func getActiveChannelIDs(ctx context.Context, uid string) ([]string, error) {
	col := firestoreClient.Collection("users").Doc(uid).Collection("allowed_channels")
	docs := col.Documents(ctx)
	defer docs.Stop()

	var ids []string
	for {
		doc, err := docs.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		data := doc.Data()
		status, _ := data["status"].(string)
		if status != "deleted" {
			ids = append(ids, doc.Ref.ID)
		}
	}
	return ids, nil
}

func readChannelVideos(ctx context.Context, channelID string) ([]*Video, error) {
	bucket := storageClient.Bucket(gcsBucket)
	prefix := fmt.Sprintf("channels/%s/batch-", channelID)

	it := bucket.Objects(ctx, &storage.Query{Prefix: prefix})
	var allVideos []*Video

	for {
		attrs, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("listing objects: %w", err)
		}

		// Skip non-.pb files (e.g. lock files)
		if !strings.HasSuffix(attrs.Name, ".pb") {
			continue
		}

		reader, err := bucket.Object(attrs.Name).NewReader(ctx)
		if err != nil {
			log.Printf("Warning: cannot read %s: %v", attrs.Name, err)
			continue
		}

		data, err := readAll(reader)
		reader.Close()
		if err != nil {
			log.Printf("Warning: cannot read %s: %v", attrs.Name, err)
			continue
		}

		videos, err := decodeVideoBatch(data)
		if err != nil {
			log.Printf("Warning: cannot decode %s: %v", attrs.Name, err)
			continue
		}

		allVideos = append(allVideos, videos...)
	}

	return allVideos, nil
}

func readAll(r *storage.Reader) ([]byte, error) {
	buf := make([]byte, 0, 1024*64)
	tmp := make([]byte, 1024*32)
	for {
		n, err := r.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return buf, err
		}
	}
	return buf, nil
}

// --- Event types for NDJSON streaming ---

type StatusEvent struct {
	Status   string `json:"status"`
	Channels int    `json:"channels,omitempty"`
}

type ProgressEvent struct {
	Status       string `json:"status"`
	Searched     int    `json:"searched"`
	Total        int    `json:"total"`
	MatchesSoFar int    `json:"matchesSoFar"`
}

type ErrorEvent struct {
	Error string `json:"error"`
}

type VideoEvent struct {
	Type        string `json:"type"`
	VideoId     string `json:"videoId"`
	Title       string `json:"title"`
	ChannelName string `json:"channelName"`
	ChannelId   string `json:"channelId"`
	PublishedAt string `json:"publishedAt"`
	Thumbnail   string `json:"thumbnail"`
}

type DoneEvent struct {
	Status string `json:"status,omitempty"`
	Total  int    `json:"total"`
}

func writeEvent(w http.ResponseWriter, flusher http.Flusher, event any) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Error marshaling event: %v", err)
		return
	}
	w.Write(data)
	w.Write([]byte("\n"))
	flusher.Flush()
}
