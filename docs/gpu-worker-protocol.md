# GPU Worker protocol

GPU Workers connect to `wss://www.ccioi.com/ws/gpu` and register before sending
heartbeats.

```json
{
  "type": "register",
  "gpu_id": "ltx-01",
  "name": "LTX Worker 01",
  "supported_models": ["ltx-2.3"]
}
```

An OpenSora Worker uses `"supported_models": ["opensora"]`. A Worker that omits
the field is treated as a legacy OpenSora Worker.

The server dispatches a model-independent payload:

```json
{
  "type": "exec_command",
  "task_id": "...",
  "user_id": "...",
  "model": "ltx-2.3",
  "prompt": "...",
  "image_url": "https://www.ccioi.com/api/storage/uploads/input.jpg",
  "image_frame": 0,
  "image_strength": 0.8,
  "width": 1536,
  "height": 1024,
  "num_frames": 481,
  "fps": 24,
  "seed": 42,
  "video_codec": "h264",
  "audio_codec": "aac"
}
```

For LTX image-to-video tasks, `image_url`, `image_frame`, and
`image_strength` are included. These fields are omitted for text-to-video.
The dispatcher converts local `/api/storage/...` paths to an absolute
`https://www.ccioi.com/api/storage/...` URL before sending them to the Worker.

The Worker owns model paths and translates these fields into its local command:

- OpenSora: `--save-dir`, `--sampling_option.num_frames`,
  `--sampling_option.aspect_ratio`, `--fps_save`, `--sampling_option.seed`.
- LTX: `--output-path`, `--num-frames`, `--height`, `--width`, `--frame-rate`,
  `--seed`, plus its locally configured checkpoint, Gemma and upsampler paths.

LTX defaults to 481 frames at 24 FPS (about 20 seconds) and 1536×1024.
Width and height must be multiples of 64, and `num_frames` must not exceed 481.
The Worker must encode the final video as H.264 with AAC audio.

During migration, OpenSora tasks also contain a legacy `command` field. LTX
Workers should use the structured fields and ignore unknown fields.
