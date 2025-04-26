document.addEventListener('DOMContentLoaded', () => {
    const app = new ArcGISConverterApp();
    app.init();
});

class ArcGISConverterApp {
    constructor() {
        this.layerUrlInput = document.getElementById('layerUrl');
        this.fetchLayerBtn = document.getElementById('fetchLayerBtn');
        this.layerMetadataDiv = document.getElementById('layerMetadata');
        this.exportControlsDiv = document.getElementById('exportControls');
        this.exportPlaceholder = document.getElementById('exportPlaceholder');
        this.exportBtn = document.getElementById('exportBtn');
        this.mapContainer = document.getElementById('map');
        this.mapPlaceholder = document.getElementById('mapPlaceholder');
        this.statusMessage = document.getElementById('statusMessage');
        this.popup = document.getElementById('popup');
        this.popupCloser = document.getElementById('popup-closer');
        this.popupContent = document.getElementById('popup-content');
        this.layerList = document.getElementById('layerList');
        this.layerSelectionModal = document.getElementById('layerSelectionModal');
        this.layerSelectionList = document.getElementById('layerSelectionList');
        this.selectAllLayers = document.getElementById('selectAllLayers');
        this.deselectAllLayers = document.getElementById('deselectAllLayers');
        this.addSelectedLayers = document.getElementById('addSelectedLayers');
        this.closeModal = document.querySelector('.close-modal');
        this.shareBtn = document.getElementById('shareBtn');

        this.map = null;
        this.vectorLayers = new Map(); // Map to store vector layers
        this.layerMetadata = new Map(); // Map to store layer metadata
        this.layerFeatures = new Map(); // Map to store layer features
        this.drawingInfo = new Map(); // Map to store drawing info
        this.overlay = null;
        this.currentFeatureServer = null;
        this.availableLayers = [];
    }

    init() {
        this.initMap();
        this.addEventListeners();
        this.handleUrlParameters();
        this.setStatus('Ready. Enter an ArcGIS Feature Layer URL.', 'info');
    }

    initMap() {
        if (this.map) return;

        // Create base layers
        const osmLayer = new ol.layer.Tile({
            source: new ol.source.OSM(),
            visible: true,
            title: 'OpenStreetMap'
        });

        const satelliteLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                maxZoom: 19
            }),
            visible: false,
            title: 'Satellite'
        });

        const terrainLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
                maxZoom: 17
            }),
            visible: false,
            title: 'Terrain'
        });

        const darkLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                maxZoom: 19
            }),
            visible: false,
            title: 'Dark'
        });

        const lightLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                maxZoom: 19
            }),
            visible: false,
            title: 'Light'
        });

        // Create map
        this.map = new ol.Map({
            target: this.mapContainer,
            layers: [osmLayer, satelliteLayer, terrainLayer, darkLayer, lightLayer],
            view: new ol.View({
                center: ol.proj.fromLonLat([0, 0]),
                zoom: 2,
                minZoom: 2,
                maxZoom: 19
            }),
            controls: [
                new ol.control.Zoom(),
                new ol.control.ScaleLine(),
                new ol.control.FullScreen(),
                new ol.control.MousePosition({
                    coordinateFormat: ol.coordinate.createStringXY(4),
                    projection: 'EPSG:4326',
                    className: 'ol-mouse-position',
                    target: document.getElementById('mouse-position')
                }),
                new ol.control.LayerSwitcher({
                    tipLabel: 'Layers',
                    groupSelectStyle: 'group',
                    activationMode: 'click',
                    startActive: false,
                    groupToggleEnter: true
                })
            ]
        });

        // Create popup overlay
        this.overlay = new ol.Overlay({
            element: this.popup,
            autoPan: true,
            autoPanAnimation: {
                duration: 250
            }
        });
        this.map.addOverlay(this.overlay);

        // Handle popup closer
        this.popupCloser.onclick = () => {
            this.overlay.setPosition(undefined);
            this.popupCloser.blur();
            return false;
        };

        // Handle map clicks
        this.map.on('click', (evt) => {
            const feature = this.map.forEachFeatureAtPixel(evt.pixel, (feature) => feature);
            if (feature) {
                const coordinates = feature.getGeometry().getCoordinates();
                const properties = feature.getProperties();
                
                // Create popup content
                const content = Object.entries(properties)
                    .filter(([key]) => key !== 'geometry')
                    .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                    .join('<br>');
                
                this.popupContent.innerHTML = content;
                this.overlay.setPosition(coordinates);
            }
        });

        // Hide placeholder
        this.mapPlaceholder.classList.add('hidden');
    }

    addEventListeners() {
        this.fetchLayerBtn.addEventListener('click', () => this.handleFetchLayer());
        this.exportBtn.addEventListener('click', () => this.handleExport());
        this.selectAllLayers.addEventListener('click', () => this.toggleAllLayers(true));
        this.deselectAllLayers.addEventListener('click', () => this.toggleAllLayers(false));
        this.addSelectedLayers.addEventListener('click', () => this.handleAddSelectedLayers());
        this.closeModal.addEventListener('click', () => this.closeLayerSelectionModal());
        this.shareBtn.addEventListener('click', () => this.copyShareableUrl());
        
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === this.layerSelectionModal) {
                this.closeLayerSelectionModal();
            }
        });
    }

    setStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type}`;
        console[type === 'error' ? 'error' : 'log'](message);
    }

    setLoading(isLoading) {
        this.fetchLayerBtn.disabled = isLoading;
        this.exportBtn.disabled = isLoading || this.vectorLayers.size === 0;
        if (isLoading) {
            this.fetchLayerBtn.textContent = 'Adding...';
        } else {
            this.fetchLayerBtn.textContent = 'Add Layer';
        }
    }

    async handleFetchLayer() {
        const url = this.layerUrlInput.value.trim();
        if (!this.isValidHttpUrl(url) || !url.includes('/FeatureServer')) {
            this.setStatus('Please enter a valid ArcGIS Feature Server URL.', 'error');
            return;
        }

        this.setLoading(true);
        this.setStatus('Fetching layer information...', 'info');

        try {
            // Check if it's a Feature Server URL or a specific layer URL
            if (url.endsWith('/FeatureServer')) {
                await this.handleFeatureServerUrl(url);
            } else {
                await this.handleSingleLayerUrl(url);
            }
        } catch (error) {
            this.setStatus(`Error: ${error.message}`, 'error');
            console.error('Detailed Error:', error);
        } finally {
            this.setLoading(false);
        }
    }

    async handleFeatureServerUrl(url) {
        // Fetch Feature Server metadata
        const metadataUrl = new URL(url);
        metadataUrl.searchParams.append('f', 'json');
        const response = await fetch(metadataUrl.toString());
        
        if (!response.ok) {
            throw new Error(`Failed to fetch Feature Server metadata: ${response.statusText}`);
        }

        const metadata = await response.json();
        if (metadata.error) {
            throw new Error(`Feature Server Error: ${metadata.error.message}`);
        }

        // Store Feature Server info
        this.currentFeatureServer = {
            url: url,
            name: metadata.name || 'Unnamed Feature Server',
            layers: metadata.layers || []
        };

        // Show layer selection modal
        this.showLayerSelectionModal();
    }

    async handleSingleLayerUrl(url) {
        // Extract layer ID from URL
        const layerId = url.split('/').pop();
        const featureServerUrl = url.substring(0, url.lastIndexOf('/'));
        
        // Fetch layer metadata
        const metadataUrl = new URL(`${featureServerUrl}/${layerId}`);
        metadataUrl.searchParams.append('f', 'json');
        const response = await fetch(metadataUrl.toString());
        
        if (!response.ok) {
            throw new Error(`Failed to fetch layer metadata: ${response.statusText}`);
        }

        const metadata = await response.json();
        if (metadata.error) {
            throw new Error(`Layer Error: ${metadata.error.message}`);
        }

        // Add the single layer
        await this.addLayer(featureServerUrl, layerId, metadata);
    }

    showLayerSelectionModal() {
        // Clear previous layer options
        this.layerSelectionList.innerHTML = '';
        
        // Add layer options
        this.currentFeatureServer.layers.forEach(layer => {
            const layerOption = document.createElement('div');
            layerOption.className = 'layer-option';
            layerOption.innerHTML = `
                <label>
                    <input type="checkbox" value="${layer.id}" data-layer-name="${layer.name}">
                    <span class="layer-name">${layer.name}</span>
                    <span class="layer-type">${layer.type} - ${layer.geometryType || 'N/A'}</span>
                </label>
            `;
            this.layerSelectionList.appendChild(layerOption);
        });

        // Show modal
        this.layerSelectionModal.style.display = 'block';
    }

    closeLayerSelectionModal() {
        this.layerSelectionModal.style.display = 'none';
        this.currentFeatureServer = null;
    }

    toggleAllLayers(select) {
        const checkboxes = this.layerSelectionList.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => checkbox.checked = select);
    }

    async handleAddSelectedLayers() {
        const selectedLayers = Array.from(this.layerSelectionList.querySelectorAll('input[type="checkbox"]:checked'));
        
        if (selectedLayers.length === 0) {
            this.setStatus('Please select at least one layer.', 'warning');
            return;
        }

        this.setLoading(true);
        this.setStatus(`Adding ${selectedLayers.length} layer(s)...`, 'info');

        try {
            for (const layer of selectedLayers) {
                const layerId = layer.value;
                const layerName = layer.dataset.layerName;
                
                // Fetch layer metadata
                const metadataUrl = new URL(`${this.currentFeatureServer.url}/${layerId}`);
                metadataUrl.searchParams.append('f', 'json');
                const response = await fetch(metadataUrl.toString());
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch layer ${layerName} metadata: ${response.statusText}`);
                }

                const metadata = await response.json();
                if (metadata.error) {
                    throw new Error(`Layer ${layerName} Error: ${metadata.error.message}`);
                }

                // Add the layer
                await this.addLayer(this.currentFeatureServer.url, layerId, metadata);
            }

            this.closeLayerSelectionModal();
            this.setStatus(`Successfully added ${selectedLayers.length} layer(s).`, 'success');
        } catch (error) {
            this.setStatus(`Error adding layers: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async addLayer(featureServerUrl, layerId, metadata) {
        // Fetch features
        const queryUrl = new URL(`${featureServerUrl}/${layerId}/query`);
        queryUrl.searchParams.append('f', 'json');
        queryUrl.searchParams.append('where', '1=1');
        queryUrl.searchParams.append('outFields', '*');
        queryUrl.searchParams.append('returnGeometry', 'true');
        queryUrl.searchParams.append('outSR', '4326');

        const featuresResponse = await fetch(queryUrl.toString());
        if (!featuresResponse.ok) {
            throw new Error(`Feature fetch failed: ${featuresResponse.statusText}`);
        }

        const featuresData = await featuresResponse.json();
        if (featuresData.error) {
            throw new Error(`Feature Query Error: ${featuresData.error.message}`);
        }

        if (!featuresData.features || !Array.isArray(featuresData.features)) {
            throw new Error('No features found or invalid feature data format.');
        }

        // Store layer data
        const layerUrl = `${featureServerUrl}/${layerId}`;
        this.layerMetadata.set(layerUrl, metadata);
        this.layerFeatures.set(layerUrl, featuresData.features);
        this.drawingInfo.set(layerUrl, metadata.drawingInfo);

        // Create vector layer
        const vectorSource = new ol.source.Vector();
        const vectorLayer = new ol.layer.Vector({
            source: vectorSource,
            title: metadata.name || 'Unnamed Layer'
        });
        this.vectorLayers.set(layerUrl, vectorLayer);
        this.map.addLayer(vectorLayer);

        // Add layer to list
        this.addLayerToList(layerUrl, metadata);

        // Display features
        this.displayFeaturesOnMap(layerUrl);
        this.showExportOptions();
    }

    addLayerToList(layerId, metadata) {
        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item';
        layerItem.innerHTML = `
            <div class="layer-info">
                <h4>${metadata.name || 'Unnamed Layer'}</h4>
                <p>${metadata.type || 'N/A'} - ${metadata.geometryType || 'N/A'}</p>
            </div>
            <button class="remove-layer" data-layer-id="${layerId}">×</button>
        `;

        layerItem.querySelector('.remove-layer').addEventListener('click', () => {
            this.removeLayer(layerId);
        });

        this.layerList.appendChild(layerItem);
    }

    removeLayer(layerId) {
        // Remove from map
        const vectorLayer = this.vectorLayers.get(layerId);
        if (vectorLayer) {
            this.map.removeLayer(vectorLayer);
            this.vectorLayers.delete(layerId);
        }

        // Remove from data storage
        this.layerMetadata.delete(layerId);
        this.layerFeatures.delete(layerId);
        this.drawingInfo.delete(layerId);

        // Remove from UI
        const layerItem = this.layerList.querySelector(`[data-layer-id="${layerId}"]`).parentElement;
        layerItem.remove();

        // Update export button state
        this.exportBtn.disabled = this.vectorLayers.size === 0;

        // Hide export options if no layers
        if (this.vectorLayers.size === 0) {
            this.hideExportOptions();
        }

        this.setStatus('Layer removed successfully.', 'info');
    }

    displayFeaturesOnMap(layerId) {
        const features = this.layerFeatures.get(layerId);
        if (!features || features.length === 0) {
            this.setStatus('No features to display on map.', 'info');
            return;
        }

        const vectorLayer = this.vectorLayers.get(layerId);
        const vectorSource = vectorLayer.getSource();
        vectorSource.clear();

        // Create style cache for symbols
        const styleCache = {};

        const olFeatures = features.map(feature => {
            let geometry = null;
            if (feature.geometry) {
                if (feature.geometry.x !== undefined && feature.geometry.y !== undefined) {
                    geometry = new ol.Feature({
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([feature.geometry.x, feature.geometry.y])),
                        ...feature.attributes
                    });
                } else if (feature.geometry.paths) {
                    // Handle LineString
                    const coordinates = feature.geometry.paths[0].map(coord => ol.proj.fromLonLat(coord));
                    geometry = new ol.Feature({
                        geometry: new ol.geom.LineString(coordinates),
                        ...feature.attributes
                    });
                } else if (feature.geometry.rings) {
                    // Handle Polygon
                    const coordinates = feature.geometry.rings.map(ring => 
                        ring.map(coord => ol.proj.fromLonLat(coord))
                    );
                    geometry = new ol.Feature({
                        geometry: new ol.geom.Polygon(coordinates),
                        ...feature.attributes
                    });
                }

                // Apply custom style if drawingInfo exists
                if (geometry && this.drawingInfo.get(layerId) && this.drawingInfo.get(layerId).renderer) {
                    const renderer = this.drawingInfo.get(layerId).renderer;
                    
                    // Handle unique value renderer
                    if (renderer.type === 'uniqueValue') {
                        const field = renderer.field1;
                        const value = feature.attributes[field];
                        
                        // Find matching symbol
                        let symbol = renderer.defaultSymbol;
                        if (renderer.uniqueValueGroups) {
                            for (const group of renderer.uniqueValueGroups) {
                                for (const cls of group.classes) {
                                    if (cls.values.includes(value)) {
                                        symbol = cls.symbol;
                                        break;
                                    }
                                }
                            }
                        }

                        // Create style from symbol
                        if (symbol && symbol.type === 'esriPMS') {
                            const key = symbol.url || symbol.imageData;
                            if (!styleCache[key]) {
                                const img = new Image();
                                img.src = symbol.imageData ? 
                                    `data:${symbol.contentType};base64,${symbol.imageData}` : 
                                    symbol.url;
                                
                                // Create a canvas to resize the image
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                canvas.width = symbol.width || 30;
                                canvas.height = symbol.height || 30;
                                
                                img.onload = () => {
                                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                    styleCache[key] = new ol.style.Style({
                                        image: new ol.style.Icon({
                                            src: canvas.toDataURL(),
                                            scale: 1,
                                            anchor: [0.5, 0.5],
                                            offset: [symbol.xoffset || 0, symbol.yoffset || 0],
                                            rotation: symbol.angle ? symbol.angle * Math.PI / 180 : 0
                                        })
                                    });
                                    geometry.setStyle(styleCache[key]);
                                };
                            } else {
                                geometry.setStyle(styleCache[key]);
                            }
                        }
                    }
                }
            }
            return geometry;
        }).filter(f => f !== null);

        vectorSource.addFeatures(olFeatures);

        // Fit map to features
        if (olFeatures.length > 0) {
            const extent = vectorSource.getExtent();
            this.map.getView().fit(extent, {
                padding: [50, 50, 50, 50],
                maxZoom: 19
            });
        }
    }

    showExportOptions() {
        this.exportControlsDiv.classList.remove('hidden');
        this.exportPlaceholder.classList.add('hidden');
        this.exportBtn.disabled = false;
    }

    hideExportOptions() {
        this.exportControlsDiv.classList.add('hidden');
        this.exportPlaceholder.classList.remove('hidden');
        this.exportBtn.disabled = true;
    }

    async handleExport() {
        if (this.vectorLayers.size === 0) {
            this.setStatus('No layers to export.', 'error');
            return;
        }

        const selectedFormats = Array.from(this.exportControlsDiv.querySelectorAll('input[name="format"]:checked'))
            .map(input => input.value);

        if (selectedFormats.length === 0) {
            this.setStatus('Please select at least one export format.', 'warning');
            return;
        }

        this.setLoading(true);
        this.setStatus('Preparing export...', 'info');

        let exportCount = 0;

        for (const [layerId, metadata] of this.layerMetadata) {
            const baseFilename = metadata.name?.replace(/\s+/g, '_') || 'exported_layer';
            const features = this.layerFeatures.get(layerId);

            for (const format of selectedFormats) {
                try {
                    this.setStatus(`Converting layer "${metadata.name}" to ${format.toUpperCase()}...`, 'info');
                    let data, mimeType, fileExt;
                    const geoJsonData = this.convertToGeoJSON(features);

                    switch (format) {
                        case 'geojson':
                            data = JSON.stringify(geoJsonData, null, 2);
                            mimeType = 'application/geo+json';
                            fileExt = 'geojson';
                            break;
                        case 'kml':
                            data = this.convertGeoJSONToKML(geoJsonData, baseFilename);
                            mimeType = 'application/vnd.google-earth.kml+xml';
                            fileExt = 'kml';
                            break;
                        case 'gpx':
                            data = this.convertGeoJSONToGPX(geoJsonData, baseFilename);
                            mimeType = 'application/gpx+xml';
                            fileExt = 'gpx';
                            break;
                        case 'shapefile':
                            this.setStatus('Shapefile export is not yet implemented.', 'warning');
                            continue; // Skip this format
                        default:
                            throw new Error(`Unsupported format: ${format}`);
                    }

                    this.downloadFile(data, `${baseFilename}.${fileExt}`, mimeType);
                    exportCount++;

                } catch (error) {
                    this.setStatus(`Error exporting layer "${metadata.name}" to ${format.toUpperCase()}: ${error.message}`, 'error');
                }
            }
        }

        if (exportCount > 0) {
             this.setStatus(`Exported ${exportCount} file(s) successfully.`, 'success');
        } else {
             this.setStatus('Export failed.', 'error');
        }
        this.setLoading(false);
    }

    convertToGeoJSON(features) {
        if (!features) return null;
        return {
            type: 'FeatureCollection',
            crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
            features: features.map(feature => {
                let geometry = null;
                if (feature.geometry) {
                    if (feature.geometry.x !== undefined && feature.geometry.y !== undefined) {
                        geometry = { type: 'Point', coordinates: [feature.geometry.x, feature.geometry.y] };
                    } else if (feature.geometry.paths) {
                        geometry = { type: 'LineString', coordinates: feature.geometry.paths[0] };
                    } else if (feature.geometry.rings) {
                        geometry = { type: 'Polygon', coordinates: feature.geometry.rings };
                    }
                }
                return {
                    type: 'Feature',
                    geometry: geometry,
                    properties: feature.attributes
                };
            }).filter(f => f.geometry)
        };
    }

    convertGeoJSONToKML(geoJsonData, layerName) {
        let kmlPlacemarks = '';

        geoJsonData.features.forEach(feature => {
            const props = feature.properties || {};
            const name = props.name || props.Name || props.NAME || 'Feature';
            const description = Object.entries(props)
                .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                .join('<br>');

            let geometryString = '';
            if (feature.geometry) {
                const coords = feature.geometry.coordinates;
                switch (feature.geometry.type) {
                    case 'Point':
                        geometryString = `<Point><coordinates>${coords[0]},${coords[1]},0</coordinates></Point>`;
                        break;
                    case 'LineString':
                         geometryString = `<LineString><coordinates>${coords.map(c => `${c[0]},${c[1]},0`).join(' ')}</coordinates></LineString>`;
                        break;
                    case 'Polygon':
                        // KML expects outerBoundaryIs and innerBoundaryIs
                        geometryString = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords[0].map(c => `${c[0]},${c[1]},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
                         // TODO: Handle inner rings (holes) if necessary
                        break;
                }
            }

            if (geometryString) {
                kmlPlacemarks += `
            <Placemark>
                <name>${this.escapeXml(name)}</name>
                <description><![CDATA[${description}]]></description>
                ${geometryString}
            </Placemark>`;
            }
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
        <name>${this.escapeXml(layerName)}</name>${kmlPlacemarks}
    </Document>
</kml>`;
    }

    convertGeoJSONToGPX(geoJsonData, layerName) {
        let gpxWaypoints = '';

        geoJsonData.features.forEach(feature => {
            if (feature.geometry && feature.geometry.type === 'Point') {
                const coords = feature.geometry.coordinates;
                const props = feature.properties || {};
                const name = props.name || props.Name || props.NAME || 'Waypoint';
                const desc = Object.entries(props)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ');
                // GPX uses lat, lon order
                gpxWaypoints += `
    <wpt lat="${coords[1]}" lon="${coords[0]}">
        <name>${this.escapeXml(name)}</name>
        <desc>${this.escapeXml(desc)}</desc>
    </wpt>`;
            }
             // Note: GPX primarily supports waypoints (Points). Tracks/Routes would require LineString conversion.
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ArcGIS Converter"
    xmlns="http://www.topografix.com/GPX/1/1"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
    <metadata>
        <name>${this.escapeXml(layerName)}</name>
    </metadata>${gpxWaypoints}
</gpx>`;
    }

    downloadFile(data, filename, mimeType) {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    isValidHttpUrl(string) {
        let url;
        try {
            url = new URL(string);
        } catch (_) {
            return false;
        }
        return url.protocol === "http:" || url.protocol === "https:"
    }

    escapeXml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe).replace(/[<>&'"/]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                case '/': return '&#x2F;'; // Added forward slash escaping
            }
        });
    }

    handleUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const singleUrl = urlParams.get('url');
        const multipleUrls = urlParams.get('urls');
        const exportFormat = urlParams.get('export');

        if (singleUrl) {
            this.layerUrlInput.value = decodeURIComponent(singleUrl);
            this.handleFetchLayer();

            if (exportFormat) {
                // Wait for layer(s) to load before setting export format
                const checkExportFormat = setInterval(() => {
                    if (this.vectorLayers.size > 0) {
                        clearInterval(checkExportFormat);
                        const formatCheckbox = this.exportControlsDiv.querySelector(`input[value="${exportFormat.toLowerCase()}"]`);
                        if (formatCheckbox) {
                            formatCheckbox.checked = true;
                            this.handleExport();
                        }
                    }
                }, 100);
            }
        } else if (multipleUrls) {
            // Handle multiple layer URLs
            const urls = decodeURIComponent(multipleUrls).split(',');
            this.loadMultipleLayers(urls, exportFormat);
        }
    }

    async loadMultipleLayers(urls, exportFormat) {
        this.setLoading(true);
        this.setStatus(`Loading ${urls.length} layer(s)...`, 'info');

        try {
            for (const url of urls) {
                this.layerUrlInput.value = url.trim();
                await this.handleFetchLayer();
            }

            if (exportFormat) {
                const formatCheckbox = this.exportControlsDiv.querySelector(`input[value="${exportFormat.toLowerCase()}"]`);
                if (formatCheckbox) {
                    formatCheckbox.checked = true;
                    this.handleExport();
                }
            }
        } catch (error) {
            this.setStatus(`Error loading layers: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    // Add a helper method to encode URLs for sharing
    getShareableUrl() {
        const baseUrl = window.location.href.split('?')[0];
        const params = new URLSearchParams();

        // If we have a Feature Server URL
        if (this.currentFeatureServer) {
            params.append('url', this.currentFeatureServer.url);
        } else {
            // If we have multiple layers, use the urls parameter
            const layerUrls = Array.from(this.vectorLayers.keys());
            if (layerUrls.length > 1) {
                params.append('urls', layerUrls.join(','));
            } else if (layerUrls.length === 1) {
                params.append('url', layerUrls[0]);
            }
        }

        // Add export format if any are selected
        const selectedFormats = Array.from(this.exportControlsDiv.querySelectorAll('input[name="format"]:checked'))
            .map(input => input.value);
        if (selectedFormats.length > 0) {
            params.append('export', selectedFormats[0]); // Use first selected format
        }

        return `${baseUrl}?${params.toString()}`;
    }

    // Add a method to copy the shareable URL to clipboard
    copyShareableUrl() {
        const url = this.getShareableUrl();
        navigator.clipboard.writeText(url).then(() => {
            this.setStatus('Shareable URL copied to clipboard!', 'success');
        }).catch(() => {
            this.setStatus('Failed to copy URL to clipboard.', 'error');
        });
    }
} 