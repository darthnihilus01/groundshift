# 🛰️ groundshift — satellite change detection, for real this time

**Watch any place on Earth. Get alerted when something changes.**

groundshift is an open-source Python framework that turns free satellite imagery into automated change alerts — deforestation, floods, construction, conflict damage, you name it. Built on real ESA Sentinel data, no satellite subscription needed.

> 🚧 Early development — the vision is clear, the code is catching up. Contributions, ideas & collabs welcome!

---

## 🌍 The Problem

The availability of free, high-resolution satellite imagery has grown significantly — yet the tooling to extract meaningful intelligence from it has not kept pace.

Existing open-source change detection approaches operate on a binary model: a region either changed or it didn't. This is insufficient for real-world monitoring. Surface conditions vary seasonally, cyclically, and in response to weather — a change that is completely normal in one month may indicate a serious anomaly in another. Without an understanding of historical baseline behaviour, binary detection produces noise, not insight.

What's missing is a system that doesn't just detect change, but contextualises it — one that continuously monitors a defined area of interest, models its expected behaviour over time, and flags deviations that fall outside that norm as anomalies.

groundshift is being built to fill that gap.

---

## 🔭 What it does

Define an area of interest anywhere on Earth. groundshift watches it — automatically pulling fresh Sentinel-2 scenes from ESA's free public archive, preprocessing them, running change detection, and firing an alert when something meaningful shifts.

The smart part: it scores changes against the **historical seasonal baseline** for that exact location. A brown field in October? Normal. A brown field in April? That's an alert.

---

## ✨ Features (planned)

* 🛰️ **Sentinel-2 ingestion** — automatic scene download via Copernicus Data Space API
* ☁️ **Cloud masking** — s2cloudless keeps bad scenes from polluting your results
* 📐 **Co-registration** — pixel-perfect alignment across dates using rasterio + GDAL
* 🔍 **Spectral baseline detector** — NDVI differencing, fast, no GPU needed
* 🤖 **Deep learning backend** — BIT-CD model with pretrained weights for complex scenes
* 📊 **Anomaly scoring** — per-pixel seasonal baselines, not just binary change/no-change
* ⏰ **Monitoring daemon** — runs on a schedule, ingests new scenes, fires alerts automatically
* 🗺️ **Annotation UI** — Leaflet.js map to review detections and label false positives
* 🇮🇳 **ISRO data support** — Resourcesat-2 & RISAT (the only open-source tool that does this)

---

## 🧠 Tech Stack

* Python 3.10+
* rasterio / GDAL
* NumPy / Xarray
* sentinelsat / openeo
* s2cloudless
* PyTorch (BIT-CD backend)
* GeoPandas
* Leaflet.js (annotation UI)
* Typer (CLI)

---

## 🎯 Use Cases

| What you want to watch | How groundshift helps |
|---|---|
| 🌲 Forest cover | Detect canopy loss from NDVI change |
| 🌊 Flood extent | Sentinel-1 SAR sees through monsoon clouds |
| 🏗️ Urban expansion | Flag new construction at city peripheries |
| 🌾 Agricultural anomalies | Compare crop cycles against multi-year baselines |
| 💥 Conflict damage | Before/after infrastructure assessment |

---

## 🇮🇳 Why India, why now

ISRO produces incredible satellite data — Resourcesat-2, RISAT-1A, Cartosat-3. And almost none of the existing open-source geospatial tooling supports it natively.

groundshift changes that. If you work in Indian remote sensing research, disaster management, or geospatial tech — this project is built with you in mind.

---

## 🚀 Quickstart (coming soon)

```bash
pip install groundshift
```

```python
import groundshift as gs

watch = gs.Watch(
    aoi="POLYGON((77.5 12.9, 77.6 12.9, 77.6 13.0, 77.5 13.0, 77.5 12.9))",
    start_date="2024-01-01",
    detector="spectral",
    alert_threshold=0.35,
    output="alerts.geojson"
)

watch.run()
```

> API is not stable yet — shape may change as the project develops.

---

## 📂 Project Structure (planned)

```
groundshift/
├── core/
│   ├── ingestion/       # Copernicus API client, tile cache
│   ├── preprocessing/   # co-registration, cloud masking, normalisation
│   ├── detection/       # detector backends (spectral, bitcd, tessera)
│   ├── scoring/         # anomaly scoring, seasonal baselines
│   └── alerting/        # GeoJSON, webhooks, map UI
├── cli/                 # groundshift CLI
├── daemon/              # monitoring loop + scheduler
└── ui/                  # Leaflet.js annotation interface
```

---

## 🤝 Contributing

This is early — which means your input actually shapes the project.

The most useful thing right now is telling me what you'd use this for. A use case, a dataset format you need, a detector you want to see supported. Open an issue, start a discussion, or just drop a star if this resonates.

Code contributions: the ingestion layer is where to start. Good first issues coming soon — watch the repo.

---

## 🌌 Why this matters

Change detection at satellite scale is how the world monitors deforestation treaties, tracks disaster damage, spots illegal mining, watches border activity, and measures climate change in real time. This capability exists today — but only inside expensive proprietary platforms or buried in inaccessible research code.

groundshift puts it in the open. For researchers, journalists, NGOs, and developers who need to know when the Earth moves.

---

## 📄 License

MIT — free to use, fork, and build on.

---

*built in the open · no vc money · just a problem worth solving*
