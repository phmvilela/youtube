package main

import (
	"sort"
	"strings"
	"unicode"
)

type rankedVideo struct {
	video         *Video
	wordMatches   int
	letterMatches int
}

// tokenize splits a query string into lowercase words, stripping non-alphanumeric chars.
func tokenize(s string) []string {
	s = strings.ToLower(s)
	words := strings.FieldsFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	// Deduplicate
	seen := make(map[string]bool, len(words))
	var result []string
	for _, w := range words {
		if !seen[w] {
			seen[w] = true
			result = append(result, w)
		}
	}
	return result
}

// matchesQuery returns true if any query word appears in the video title or channel name.
func matchesQuery(v *Video, queryWords []string) bool {
	title := strings.ToLower(v.Title)
	channel := strings.ToLower(v.ChannelName)

	for _, qw := range queryWords {
		if strings.Contains(title, qw) || strings.Contains(channel, qw) {
			return true
		}
	}
	return false
}

// rankVideo scores a video based on how well it matches the query words.
// Uses the same ranking logic as Search.tsx: word matches primary, letter matches secondary.
func rankVideo(v *Video, queryWords []string) rankedVideo {
	// Build the set of words from title + channel name (same as searchWords in Firestore)
	videoText := strings.ToLower(v.Title + " " + v.ChannelName)
	videoWords := tokenize(videoText)

	wordMatches := 0
	letterMatches := 0

	for _, qw := range queryWords {
		exactMatch := false
		for _, vw := range videoWords {
			if vw == qw {
				exactMatch = true
				break
			}
		}
		if exactMatch {
			wordMatches++
			letterMatches += len(qw)
		} else {
			// Check partial match
			for _, vw := range videoWords {
				if strings.Contains(vw, qw) {
					letterMatches += len(qw)
					break
				}
			}
		}
	}

	return rankedVideo{
		video:         v,
		wordMatches:   wordMatches,
		letterMatches: letterMatches,
	}
}

func sortRankedVideos(videos []rankedVideo) {
	sort.SliceStable(videos, func(i, j int) bool {
		if videos[i].wordMatches != videos[j].wordMatches {
			return videos[i].wordMatches > videos[j].wordMatches
		}
		return videos[i].letterMatches > videos[j].letterMatches
	})
}
