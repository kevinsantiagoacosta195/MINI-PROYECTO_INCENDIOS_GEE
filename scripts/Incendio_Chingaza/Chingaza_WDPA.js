// Cargar áreas protegidas mundiales
var wdpa = ee.FeatureCollection('WCMC/WDPA/current/polygons');

// Extraer ROI del PNN Chingaza
var roi = wdpa
  .filter(ee.Filter.stringContains('NAME', 'Chingaza'))
  .geometry();

// Visualización
Map.centerObject(roi, 10);
Map.addLayer(roi, {color: 'green'}, 'ROI - PNN Chingaza');
