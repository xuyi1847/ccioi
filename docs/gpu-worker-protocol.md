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
  "width": 768,
  "height": 512,
  "num_frames": 121,
  "fps": 24,
  "seed": 42
}
```

For LTX image-to-video tasks, `image_url`, `image_frame`, and
`image_strength` are included. These fields are omitted for text-to-video.

The Worker owns model paths and translates these fields into its local command:

- OpenSora: `--save-dir`, `--sampling_option.num_frames`,
  `--sampling_option.aspect_ratio`, `--fps_save`, `--sampling_option.seed`.
- LTX: `--output-path`, `--num-frames`, `--height`, `--width`, `--frame-rate`,
  `--seed`, plus its locally configured checkpoint, Gemma and upsampler paths.

During migration, OpenSora tasks also contain a legacy `command` field. LTX
Workers should use the structured fields and ignore unknown fields.
