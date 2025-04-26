# ArcGIS Layer Converter

A web application for converting ArcGIS layers to various formats for offline use in applications like ATAK, QGIS, and other GIS programs.

## Features

- Convert ArcGIS layers to multiple formats:
  - KML (Keyhole Markup Language)
  - GeoJSON
  - GPX (GPS Exchange Format)
  - Shapefile (coming soon)
- Preview layer data on an interactive map
- Export multiple formats simultaneously
- Modern, responsive user interface
- URL encoding
- Shareable URLs
- Layer selection
- Support for ArcGIS Online item URLs

## URL Examples

### Feature Server URLs
```
https://services.arcgis.com/[organization]/arcgis/rest/services/[service_name]/FeatureServer/[layer_id]
```

### ArcGIS Online Item URLs
```
https://www.arcgis.com/home/item.html?id=[item_id]
```

### URL Parameters
The application supports URL parameters for pre-loading layers and exporting:

- `?url=LAYER_URL` - Load a single layer
- `?url=FEATURE_SERVER_URL` - Load a Feature Server and show layer selection
- `?urls=LAYER_URL1,LAYER_URL2` - Load multiple specific layers
- `?export=FORMAT` - Export in specified format (kml, geojson, gpx)

Example with URL encoding:
```
https://your-domain.com/?url=https%3A%2F%2Fservices.arcgis.com%2Fyour-org%2Farcgis%2Frest%2Fservices%2FExampleLayer%2FFeatureServer%2F0
```

## License

MIT License 