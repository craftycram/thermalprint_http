# thermalprint-http

A small REST API for ESC/POS thermal receipt printers, built on
[node-thermal-printer](https://github.com/Klemen1337/node-thermal-printer). It's tested with an
Epson TM-T20II and also works with Star, Tanca, Daruma, Brother and custom printers over USB,
the network or a file.

- Swagger UI at `/swagger`
- Structured print jobs (text styles, tables, QR, barcodes, images, cut, beep, cash drawer, raw bytes)
- Jobs run one at a time, so concurrent requests never interleave on the paper
- Optional API key auth
- Configured entirely through env vars, and a bad config stops the service at startup
- Docker image with a healthcheck; runs as a non-root user with access to `lp` devices

## Quick start (Docker Compose)

```yaml
services:
  thermalprint:
    image: ghcr.io/craftycram/thermalprint_http:latest
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      PRINTER_TYPE: epson
      PRINTER_INTERFACE: /dev/usb/lp0
      PRINTER_CHARACTER_SET: PC858_EURO
      API_KEY: change-me-please
    devices:
      - /dev/usb/lp0:/dev/usb/lp0
```

```sh
docker compose up -d
curl -X POST -H 'X-API-Key: change-me-please' localhost:3000/print/test
```

For a **network printer**, drop `devices` and set `PRINTER_INTERFACE=tcp://192.168.1.50:9100`.

### USB notes

- Linux exposes USB printers as `/dev/usb/lp0` through the `usblp` kernel module (`ls -l /dev/usb/`).
- The container runs as `node`, which belongs to group `lp` (gid 7). This matches the device's
  default group on Debian, Ubuntu and Raspberry Pi OS. If your device has a different group, add
  `group_add: ['<gid>']`, or as a last resort `user: root`.
- USB passthrough doesn't work with Docker Desktop on macOS or Windows. Use a Linux host or a
  network printer.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `API_KEY` | – | If set, every endpoint except `/` and `/health` needs `X-API-Key: <key>` or `Authorization: Bearer <key>` (at least 8 characters) |
| `BODY_LIMIT_MB` | `10` | Maximum size of a JSON body or image upload |
| `SWAGGER_ENABLED` | `true` | Serve the Swagger UI |
| `SWAGGER_PATH` | `swagger` | Swagger UI path; the OpenAPI JSON is served at `/<path>-json` |
| `CORS_ORIGIN` | – | `*`, or origins separated by `\|`. Leave empty to disable CORS |
| `PRINTER_TYPE` | `epson` | `epson`, `star`, `tanca`, `daruma`, `brother` or `custom` |
| `PRINTER_INTERFACE` | `/dev/usb/lp0` | A device path, `tcp://host:port`, or any writable file |
| `PRINTER_WIDTH` | `48` | Characters per line: 48 for 80mm paper, about 32–35 for 58mm |
| `PRINTER_CHARACTER_SET` | `PC437_USA` | Code page, e.g. `PC858_EURO`, `PC850_MULTILINGUAL`, `WPC1252`, `PC866_CYRILLIC2`, `JAPAN`… ([full list](https://github.com/Klemen1337/node-thermal-printer#character-set)). For characters the active page can't print, the library switches pages automatically |
| `PRINTER_REMOVE_SPECIAL_CHARACTERS` | `false` | Strip accents (`é` → `e`) |
| `PRINTER_LINE_CHARACTER` | `-` | Character used by the `line` command |
| `PRINTER_BREAK_LINE` | `WORD` | Line wrapping: `WORD`, `CHARACTER` or `NONE` |
| `PRINTER_TIMEOUT` | `3000` | Connect timeout for `tcp://` printers, in ms |
| `PRINTER_CUT_AFTER_JOB` | `true` | Cut after each job. A request can override this with `"cut": false` |

For local development, a `.env` file is loaded automatically. See `.env.example`.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Greeting, version and a message of the day (public) |
| GET | `/health` | Printer reachability; returns `503` when the printer is unreachable (public) |
| GET | `/printer/status` | Printer config and reachability |
| POST | `/print` | Print a job made of commands |
| POST | `/print/text` | `{ "text": "line 1\nline 2", "cut": true }` |
| POST | `/print/image` | multipart: `image` (a PNG file) plus an optional `cut` |
| POST | `/print/raw` | `{ "data": "<base64 ESC/POS bytes>" }`, sent to the printer unchanged |
| POST | `/print/test` | Print a test page |

Print endpoints return `{ success, bytes, durationMs }`. Errors use Nest's standard shape
`{ statusCode, message, error }`:

- `400`: invalid job, such as a bad field or an unreadable PNG
- `401`: missing or wrong API key
- `503`: the printer is unreachable or the write failed

### Print job

```sh
curl -X POST localhost:3000/print -H 'content-type: application/json' -d '{
  "commands": [
    { "type": "text", "text": "MY SHOP", "align": "center", "bold": true, "width": 2, "height": 2 },
    { "type": "line" },
    { "type": "table", "cells": [{ "text": "Qty", "width": 0.2 }, { "text": "Item", "width": 0.5 }, { "text": "Price", "width": 0.3, "align": "right" }] },
    { "type": "leftRight", "left": "Coffee", "right": "3.50 €" },
    { "type": "line", "character": "=" },
    { "type": "text", "text": "Thank you!", "align": "center", "underline": true },
    { "type": "qr", "data": "https://example.com", "cellSize": 6 },
    { "type": "barcode", "data": "4006381333931", "barcodeType": 67 },
    { "type": "cashDrawer" }
  ]
}'
```

Styles apply only to the command they're set on. Each command's full schema is in Swagger.

| `type` | Fields |
| --- | --- |
| `text` | `text`, `align`, `bold`, `underline`, `invert`, `upsideDown`, `font` (`A`/`B`), `width`/`height` (1–8), `newLine` (default `true`) |
| `newLine` | `count` |
| `line` | `character` |
| `leftRight` | `left`, `right` |
| `table` | `cells[]`: `text`, `align`, `width` (a fraction of the line), `bold` |
| `qr` | `data`, `cellSize` (1–8), `correction` (`L`/`M`/`Q`/`H`), `align` (default center) |
| `barcode` | `data`, `barcodeType` (default 73 = CODE128), `width`, `height`, `hriPos`, `align` |
| `image` | `data` (a base64 PNG, at most 576px wide on a TM-T20II), `align` |
| `cut` | `partial` |
| `beep` | `count`, `duration` (1–9; the printer needs a buzzer) |
| `cashDrawer` | – |
| `raw` | `data` (base64 bytes) |

```sh
curl -X POST localhost:3000/print/image -F image=@logo.png -F cut=false
```

## Development

```sh
yarn install
cp .env.example .env   # e.g. PRINTER_INTERFACE=/tmp/printer.bin to print to a file
yarn start:dev
yarn test
```

## Release

This uses the same flow as the other services. GitHub Actions builds the image and pushes it to
GHCR:

- a push to `dev` publishes `:dev`, `:dev-<run>` and `:sha-<sha>`
- a `v*` tag publishes `:latest`, `:<tag>` and `:sha-<sha>`
