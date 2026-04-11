package main

// Manual protobuf decoder for the simple Video/VideoBatch schema.
// At Docker build time, this can be replaced with protoc-generated code.
//
// Wire format reference:
//   VideoBatch: field 1 (repeated Video, length-delimited)
//   Video: fields 1-6 (all strings, length-delimited)

import (
	"encoding/binary"
	"fmt"
	"io"
)

type Video struct {
	VideoId     string `json:"videoId"`
	Title       string `json:"title"`
	ChannelName string `json:"channelName"`
	ChannelId   string `json:"channelId"`
	PublishedAt string `json:"publishedAt"`
	Thumbnail   string `json:"thumbnail"`
}

func decodeVideoBatch(data []byte) ([]*Video, error) {
	var videos []*Video
	pos := 0
	for pos < len(data) {
		fieldNum, wireType, n, err := decodeTag(data[pos:])
		if err != nil {
			return nil, fmt.Errorf("decoding tag at %d: %w", pos, err)
		}
		pos += n

		if wireType != 2 { // length-delimited
			return nil, fmt.Errorf("unexpected wire type %d for field %d", wireType, fieldNum)
		}

		length, n, err := decodeVarint(data[pos:])
		if err != nil {
			return nil, fmt.Errorf("decoding length at %d: %w", pos, err)
		}
		pos += n

		if pos+int(length) > len(data) {
			return nil, io.ErrUnexpectedEOF
		}

		if fieldNum == 1 {
			v, err := decodeVideo(data[pos : pos+int(length)])
			if err != nil {
				return nil, fmt.Errorf("decoding video: %w", err)
			}
			videos = append(videos, v)
		}
		// skip unknown fields
		pos += int(length)
	}
	return videos, nil
}

func decodeVideo(data []byte) (*Video, error) {
	v := &Video{}
	pos := 0
	for pos < len(data) {
		fieldNum, wireType, n, err := decodeTag(data[pos:])
		if err != nil {
			return nil, err
		}
		pos += n

		if wireType != 2 {
			return nil, fmt.Errorf("unexpected wire type %d for video field %d", wireType, fieldNum)
		}

		length, n, err := decodeVarint(data[pos:])
		if err != nil {
			return nil, err
		}
		pos += n

		if pos+int(length) > len(data) {
			return nil, io.ErrUnexpectedEOF
		}

		s := string(data[pos : pos+int(length)])
		switch fieldNum {
		case 1:
			v.VideoId = s
		case 2:
			v.Title = s
		case 3:
			v.ChannelName = s
		case 4:
			v.ChannelId = s
		case 5:
			v.PublishedAt = s
		case 6:
			v.Thumbnail = s
		}
		pos += int(length)
	}
	return v, nil
}

func decodeTag(data []byte) (fieldNum int, wireType int, n int, err error) {
	v, n, err := decodeVarint(data)
	if err != nil {
		return 0, 0, 0, err
	}
	return int(v >> 3), int(v & 0x7), n, nil
}

func decodeVarint(data []byte) (uint64, int, error) {
	v, n := binary.Uvarint(data)
	if n <= 0 {
		return 0, 0, fmt.Errorf("invalid varint")
	}
	return v, n, nil
}
