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
        this.layerSearch = document.getElementById('layerSearch');
        this.layerTypeFilters = document.querySelectorAll('.layer-type-filters input[type="checkbox"]');
        this.layerCount = document.querySelector('.layer-count');
        
        this.map = null;
        this.vectorLayers = new Map();
        this.layerMetadata = new Map();
        this.layerFeatures = new Map();
        this.drawingInfo = new Map();
        this.overlay = null;
        this.currentFeatureServer = null;
        this.availableLayers = [];
        this.currentItem = null;
        this.layerGroups = new Map();
    }

    init() {
        this.initMap();
        this.addEventListeners();
        this.handleUrlParameters();
        this.setStatus('Ready. Enter an ArcGIS Feature Layer URL.', 'info');
    }

    initMap() {
        if (this.map) return;

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

        this.overlay = new ol.Overlay({
            element: this.popup,
            autoPan: true,
            autoPanAnimation: {
                duration: 250
            }
        });
        this.map.addOverlay(this.overlay);

        this.popupCloser.onclick = () => {
            this.overlay.setPosition(undefined);
            this.popupCloser.blur();
            return false;
        };

        this.map.on('click', (evt) => {
            const feature = this.map.forEachFeatureAtPixel(evt.pixel, (feature) => feature);
            if (feature) {
                const coordinates = feature.getGeometry().getCoordinates();
                const properties = feature.getProperties();
                
                const content = Object.entries(properties)
                    .filter(([key]) => key !== 'geometry')
                    .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                    .join('<br>');
                
                this.popupContent.innerHTML = content;
                this.overlay.setPosition(coordinates);
            }
        });

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
        this.layerSearch.addEventListener('input', () => this.filterLayers());
        this.layerTypeFilters.forEach(filter => {
            filter.addEventListener('change', () => this.filterLayers());
        });
        
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
        if (!this.isValidHttpUrl(url)) {
            this.setStatus('Please enter a valid URL.', 'error');
            return;
        }

        this.setLoading(true);
        this.setStatus('Fetching layer information...', 'info');

        try {
            if (url.includes('arcgis.com/home/item.html')) {
                await this.handleArcGISOnlineItem(url);
            } else if (url.includes('/FeatureServer')) {
                if (url.endsWith('/FeatureServer')) {
                    await this.handleFeatureServerUrl(url);
                } else {
                    await this.handleSingleLayerUrl(url);
                }
            } else {
                throw new Error('Unsupported URL format. Please enter an ArcGIS Online item URL or Feature Server URL.');
            }
        } catch (error) {
            this.setStatus(`Error: ${error.message}`, 'error');
            console.error('Detailed Error:', error);
        } finally {
            this.setLoading(false);
        }
    }

    async handleArcGISOnlineItem(url) {
        const itemId = url.match(/id=([^&]+)/)?.[1];
        if (!itemId) {
            throw new Error('Invalid ArcGIS Online item URL. Could not extract item ID.');
        }

        const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`;
        const response = await fetch(itemUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch item metadata: ${response.statusText}`);
        }

        const itemData = await response.json();
        if (itemData.error) {
            throw new Error(`Item Error: ${itemData.error.message}`);
        }

        this.currentItem = {
            id: itemId,
            name: itemData.name,
            type: itemData.type,
            url: itemData.url
        };

        switch (itemData.type) {
            case 'Map Service':
                await this.handleMapService(itemData);
                break;
            case 'Web Map':
                await this.handleWebMap(itemData);
                break;
            default:
                throw new Error(`Unsupported item type: ${itemData.type}. Currently supporting Map Services and Web Maps.`);
        }
    }

    async handleMapService(itemData) {
        const layersUrl = `${itemData.url}?f=json`;
        const layersResponse = await fetch(layersUrl);
        
        if (!layersResponse.ok) {
            throw new Error(`Failed to fetch layers: ${layersResponse.statusText}`);
        }

        const layersData = await layersResponse.json();
        if (layersData.error) {
            throw new Error(`Layers Error: ${layersData.error.message}`);
        }

        this.groupLayers(layersData.layers || []);
        this.showLayerSelectionModal();
    }

    async handleWebMap(itemData) {
        const webMapUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemData.id}/data?f=json`;
        console.log('Fetching Web Map data from:', webMapUrl);
        
        const webMapResponse = await fetch(webMapUrl);
        
        if (!webMapResponse.ok) {
            throw new Error(`Failed to fetch Web Map data: ${webMapResponse.statusText}`);
        }

        const webMapData = await webMapResponse.json();
        console.log('Web Map data:', webMapData);
        
        if (webMapData.error) {
            throw new Error(`Web Map Error: ${webMapData.error.message}`);
        }

        const layers = [];
        if (webMapData.operationalLayers) {
            console.log('Found operational layers:', webMapData.operationalLayers);
            
            for (const layer of webMapData.operationalLayers) {
                console.log('Processing layer:', layer);
                await this.processLayer(layer, layers, []);
            }
        }

        console.log('Final layers array:', layers);

        this.groupLayers(layers);
        this.showLayerSelectionModal();
    }

    async processLayer(layer, layers, parentPath = []) {
        const currentPath = [...parentPath, layer.title];
        console.log('Processing layer path:', currentPath.join(' > '));

        if (layer.layers) {
            console.log('Found group layer:', layer.title);
            for (const subLayer of layer.layers) {
                await this.processLayer(subLayer, layers, currentPath);
            }
        } else if (layer.url) {
            const layerUrl = layer.url;
            console.log('Fetching service:', layerUrl);
            
            const layerResponse = await fetch(`${layerUrl}?f=json`);
            
            if (layerResponse.ok) {
                const layerData = await layerResponse.json();
                console.log('Service data:', layerData);
                
                if (layerData.layers) {
                    layers.push(...layerData.layers.map(l => ({
                        ...l,
                        parentLayerId: layer.id,
                        parentLayerName: layer.title,
                        parentPath: currentPath,
                        serviceUrl: layerUrl
                    })));
                } else if (layerData.type === 'ImageServer') {
                    layers.push({
                        id: layer.id,
                        name: layer.title,
                        type: 'Imagery Layer',
                        serviceUrl: layerUrl,
                        parentLayerId: layer.id,
                        parentLayerName: layer.title,
                        parentPath: currentPath
                    });
                } else {
                    layers.push({
                        ...layerData,
                        parentLayerId: layer.id,
                        parentLayerName: layer.title,
                        parentPath: currentPath,
                        serviceUrl: layerUrl
                    });
                }
            }
        } else if (layer.itemId) {
            console.log('Found item reference:', layer.itemId);
            
            const itemUrl = `https://www.arcgis.com/sharing/rest/content/items/${layer.itemId}?f=json`;
            const itemResponse = await fetch(itemUrl);
            
            if (itemResponse.ok) {
                const itemData = await itemResponse.json();
                console.log('Item data:', itemData);
                
                if (itemData.url) {
                    const serviceUrl = itemData.url;
                    const serviceResponse = await fetch(`${serviceUrl}?f=json`);
                    
                    if (serviceResponse.ok) {
                        const serviceData = await serviceResponse.json();
                        console.log('Service data:', serviceData);
                        
                        if (serviceData.layers) {
                            layers.push(...serviceData.layers.map(l => ({
                                ...l,
                                parentLayerId: layer.id,
                                parentLayerName: layer.title,
                                parentPath: currentPath,
                                serviceUrl: serviceUrl
                            })));
                        } else if (serviceData.type === 'ImageServer') {
                            layers.push({
                                id: layer.id,
                                name: layer.title,
                                type: 'Imagery Layer',
                                serviceUrl: serviceUrl,
                                parentLayerId: layer.id,
                                parentLayerName: layer.title,
                                parentPath: currentPath
                            });
                        } else {
                            layers.push({
                                ...serviceData,
                                parentLayerId: layer.id,
                                parentLayerName: layer.title,
                                parentPath: currentPath,
                                serviceUrl: serviceUrl
                            });
                        }
                    }
                }
            }
        } else if (layer.featureCollection) {
            console.log('Found Feature Collection:', layer.featureCollection);
            
            if (layer.featureCollection.layers) {
                layers.push(...layer.featureCollection.layers.map(l => ({
                    ...l,
                    id: `${layer.id}_${l.id}`,
                    name: layer.title,
                    type: 'Feature Layer',
                    parentLayerId: layer.id,
                    parentLayerName: layer.title,
                    parentPath: currentPath
                })));
            } else {
                layers.push({
                    id: layer.id,
                    name: layer.title,
                    type: 'Feature Layer',
                    geometryType: layer.featureCollection.layers?.[0]?.geometryType,
                    parentLayerId: layer.id,
                    parentLayerName: layer.title,
                    parentPath: currentPath
                });
            }
        } else if (layer.layerType === 'ArcGISFeatureLayer') {
            layers.push({
                id: layer.id,
                name: layer.title,
                type: 'Feature Layer',
                parentLayerId: layer.id,
                parentLayerName: layer.title,
                parentPath: currentPath,
                serviceUrl: layer.url
            });
        }
    }

    groupLayers(layers) {
        this.layerGroups.clear();
        
        const groups = {
            feature: { name: 'Feature Layers', layers: [] },
            tiled: { name: 'Tiled Layers', layers: [] },
            imagery: { name: 'Imagery Layers', layers: [] },
            other: { name: 'Other Layers', layers: [] }
        };

        layers.forEach(layer => {
            const type = this.getLayerType(layer);
            if (groups[type]) {
                groups[type].layers.push(layer);
            } else {
                groups.other.layers.push(layer);
            }
        });

        Object.entries(groups).forEach(([type, group]) => {
            if (group.layers.length > 0) {
                this.layerGroups.set(type, group);
            }
        });
    }

    getLayerType(layer) {
        if (layer.type === 'Feature Layer' || layer.type === 'Feature Collection') return 'feature';
        if (layer.type === 'Tiled Layer') return 'tiled';
        if (layer.type === 'Imagery Layer' || layer.type === 'ImageServer') return 'imagery';
        return 'other';
    }

    showLayerSelectionModal() {
        this.layerSelectionList.innerHTML = '';
        
        this.layerGroups.forEach((group, type) => {
            const groupElement = document.createElement('div');
            groupElement.className = 'layer-group';
            groupElement.innerHTML = `
                <div class="layer-group-header">
                    <h4>${group.name}</h4>
                    <span class="group-count">${group.layers.length} layers</span>
                </div>
                <div class="layer-group-content">
                    ${group.layers.map(layer => this.createLayerOption(layer, type)).join('')}
                </div>
            `;

            const header = groupElement.querySelector('.layer-group-header');
            const content = groupElement.querySelector('.layer-group-content');
            header.addEventListener('click', () => {
                content.classList.toggle('expanded');
            });

            this.layerSelectionList.appendChild(groupElement);
        });

        this.layerSelectionModal.style.display = 'block';
        this.updateLayerCount();
    }

    createLayerOption(layer, type) {
        const parentInfo = layer.parentPath ? 
            `<span class="layer-parent">${layer.parentPath.join(' > ')}</span>` : '';
        
        return `
            <div class="layer-option" data-type="${type}">
                <label>
                    <input type="checkbox" value="${layer.id}" 
                           data-layer-name="${layer.name}" 
                           data-parent-id="${layer.parentLayerId || ''}" 
                           data-service-url="${layer.serviceUrl || ''}">
                    <span class="layer-icon ${type}">${this.getLayerIcon(type)}</span>
                    <span class="layer-name">${layer.name}</span>
                    ${parentInfo}
                    <span class="layer-type">${layer.type} - ${layer.geometryType || 'N/A'}</span>
                </label>
                <div class="layer-tooltip">
                    <p><strong>ID:</strong> ${layer.id}</p>
                    <p><strong>Type:</strong> ${layer.type}</p>
                    ${layer.geometryType ? `<p><strong>Geometry:</strong> ${layer.geometryType}</p>` : ''}
                    ${layer.description ? `<p><strong>Description:</strong> ${layer.description}</p>` : ''}
                    ${layer.parentPath ? `<p><strong>Path:</strong> ${layer.parentPath.join(' > ')}</p>` : ''}
                    ${layer.serviceUrl ? `<p><strong>Service URL:</strong> ${layer.serviceUrl}</p>` : ''}
                </div>
            </div>
        `;
    }

    getLayerIcon(type) {
        const icons = {
            feature: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
            tiled: '<svg viewBox="0 0 24 24"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>',
            imagery: '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
            other: '<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>'
        };
        return icons[type] || icons.other;
    }

    filterLayers() {
        const searchTerm = this.layerSearch.value.toLowerCase();
        const selectedTypes = Array.from(this.layerTypeFilters)
            .filter(filter => filter.checked)
            .map(filter => filter.value);

        const layerOptions = this.layerSelectionList.querySelectorAll('.layer-option');
        layerOptions.forEach(option => {
            const type = option.dataset.type;
            const name = option.querySelector('.layer-name').textContent.toLowerCase();
            const typeMatch = selectedTypes.includes(type);
            const searchMatch = name.includes(searchTerm);
            option.style.display = typeMatch && searchMatch ? 'block' : 'none';
        });

        this.updateLayerCount();
    }

    updateLayerCount() {
        const visibleLayers = this.layerSelectionList.querySelectorAll('.layer-option[style="display: block"]').length;
        const selectedLayers = this.layerSelectionList.querySelectorAll('input[type="checkbox"]:checked').length;
        this.layerCount.textContent = `${selectedLayers} of ${visibleLayers} layers selected`;
    }

    async handleFeatureServerUrl(url) {
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

        this.currentFeatureServer = {
            url: url,
            name: metadata.name || 'Unnamed Feature Server',
            layers: metadata.layers || []
        };

        this.showLayerSelectionModal();
    }

    async handleSingleLayerUrl(url) {
        const layerId = url.split('/').pop();
        const featureServerUrl = url.substring(0, url.lastIndexOf('/'));
        
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

        await this.addLayer(featureServerUrl, layerId, metadata);
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
                const serviceUrl = layer.dataset.serviceUrl;
                
                if (!serviceUrl) {
                    console.warn(`Skipping layer ${layerName} - no service URL found`);
                    continue;
                }

                const metadataUrl = new URL(serviceUrl);
                metadataUrl.searchParams.append('f', 'json');
                const response = await fetch(metadataUrl.toString());
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch layer ${layerName} metadata: ${response.statusText}`);
                }

                const metadata = await response.json();
                if (metadata.error) {
                    throw new Error(`Layer ${layerName} Error: ${metadata.error.message}`);
                }

                await this.addLayer(serviceUrl, layerId, metadata);
            }

            this.closeLayerSelectionModal();
            this.setStatus(`Successfully added ${selectedLayers.length} layer(s).`, 'success');
        } catch (error) {
            this.setStatus(`Error adding layers: ${error.message}`, 'error');
            console.error('Error details:', error);
        } finally {
            this.setLoading(false);
        }
    }

    async addLayer(featureServerUrl, layerId, metadata) {
        try {
            const baseUrl = featureServerUrl.split('/FeatureServer')[0] + '/FeatureServer';
            const queryUrl = new URL(`${baseUrl}/${layerId}/query`);
            
            queryUrl.searchParams.append('f', 'json');
            queryUrl.searchParams.append('where', '1=1');
            queryUrl.searchParams.append('outFields', '*');
            queryUrl.searchParams.append('returnGeometry', 'true');
            queryUrl.searchParams.append('outSR', '4326');

            console.log('Fetching features from:', queryUrl.toString());
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

            const layerUrl = `${baseUrl}/${layerId}`;
            this.layerMetadata.set(layerUrl, metadata);
            this.layerFeatures.set(layerUrl, featuresData.features);
            this.drawingInfo.set(layerUrl, metadata.drawingInfo);

            const vectorSource = new ol.source.Vector();
            const vectorLayer = new ol.layer.Vector({
                source: vectorSource,
                title: metadata.name || 'Unnamed Layer'
            });
            this.vectorLayers.set(layerUrl, vectorLayer);
            this.map.addLayer(vectorLayer);

            this.addLayerToList(layerUrl, metadata);

            this.displayFeaturesOnMap(layerUrl);
            this.showExportOptions();
        } catch (error) {
            console.error('Error in addLayer:', error);
            throw error;
        }
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
        const vectorLayer = this.vectorLayers.get(layerId);
        if (vectorLayer) {
            this.map.removeLayer(vectorLayer);
            this.vectorLayers.delete(layerId);
        }

        this.layerMetadata.delete(layerId);
        this.layerFeatures.delete(layerId);
        this.drawingInfo.delete(layerId);

        const layerItem = this.layerList.querySelector(`[data-layer-id="${layerId}"]`).parentElement;
        layerItem.remove();

        this.exportBtn.disabled = this.vectorLayers.size === 0;

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
                    const coordinates = feature.geometry.paths[0].map(coord => ol.proj.fromLonLat(coord));
                    geometry = new ol.Feature({
                        geometry: new ol.geom.LineString(coordinates),
                        ...feature.attributes
                    });
                } else if (feature.geometry.rings) {
                    const coordinates = feature.geometry.rings.map(ring => 
                        ring.map(coord => ol.proj.fromLonLat(coord))
                    );
                    geometry = new ol.Feature({
                        geometry: new ol.geom.Polygon(coordinates),
                        ...feature.attributes
                    });
                }

                if (geometry && this.drawingInfo.get(layerId) && this.drawingInfo.get(layerId).renderer) {
                    const renderer = this.drawingInfo.get(layerId).renderer;
                    
                    if (renderer.type === 'uniqueValue') {
                        const field = renderer.field1;
                        const value = feature.attributes[field];
                        
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

                        if (symbol && symbol.type === 'esriPMS') {
                            const key = symbol.url || symbol.imageData;
                            if (!styleCache[key]) {
                                const img = new Image();
                                img.src = symbol.imageData ? 
                                    `data:${symbol.contentType};base64,${symbol.imageData}` : 
                                    symbol.url;
                                
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