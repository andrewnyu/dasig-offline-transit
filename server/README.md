# Route-pack publisher

This optional FastAPI service publishes the bundled Bacolod GeoJSON as an
immutable, content-addressed pack. The Android app never needs it to calculate
a trip; it only checks the service when the rider explicitly requests a route
update.

```bash
python -m pip install -r server/requirements.txt
uvicorn server.main:app --reload
```

To point a private build at another deployment, change `ROUTE_PACK_SERVER` in
`App.tsx`. Production deployments should use HTTPS.
