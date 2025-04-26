// Web Worker for processing features
self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'processFeatures':
            try {
                const processedFeatures = processFeatures(data);
                self.postMessage({
                    type: 'featureProcessing',
                    data: processedFeatures
                });
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    data: error.message
                });
            }
            break;
    }
};

function processFeatures(features) {
    return features.map(feature => {
        let geometry = null;
        if (feature.geometry) {
            if (feature.geometry.x !== undefined && feature.geometry.y !== undefined) {
                geometry = {
                    type: 'Point',
                    coordinates: [feature.geometry.x, feature.geometry.y],
                    properties: feature.attributes
                };
            } else if (feature.geometry.paths) {
                geometry = {
                    type: 'LineString',
                    coordinates: feature.geometry.paths[0],
                    properties: feature.attributes
                };
            } else if (feature.geometry.rings) {
                geometry = {
                    type: 'Polygon',
                    coordinates: feature.geometry.rings,
                    properties: feature.attributes
                };
            }
        }
        return geometry;
    }).filter(f => f !== null);
} 