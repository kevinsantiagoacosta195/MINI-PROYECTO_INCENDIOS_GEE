// Developed and tested in Google Earth Engine Code Editor
// Dataset: COPERNICUS/S2_SR_HARMONIZED


// 1. ROI DESDE WDPA
// ================================

// Cargar áreas protegidas mundiales
var wdpa = ee.FeatureCollection('WCMC/WDPA/current/polygons');

// Extraer ROI del PNN Chingaza
var roi = wdpa
  .filter(ee.Filter.stringContains('NAME', 'Chingaza'))
  .geometry();

// Visualización ROI
Map.centerObject(roi, 10);
Map.addLayer(roi, {color: 'green'}, 'ROI - PNN Chingaza');


// 2. FUNCIÓN DE MÁSCARA DE NUBES
// ================================
function maskS2clouds(image) {

  var qa = image.select('QA60');

  // Bits de nubes y cirros
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image
    .updateMask(mask)
    .divide(10000);
}


// 3. CARGAR SENTINEL-2 PRE. INCEDIO
// ================================
var s2_pre = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2024-12-01', '2025-01-10')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
  .map(maskS2clouds);

var pre = s2_pre.median().clip(roi);

// 4. CARGAR SETINEL-2  POST INCENDIO

var s2_post = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2025-01-20', '2025-02-28')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
  .map(maskS2clouds);

var post = s2_post.median().clip(roi);

// 5. CREAR IMAGEN 
// ================================
var pre = s2_pre
  .median()
  .clip(roi);

var post = s2_post
  .median()
  .clip(roi);

// 6. VISUALIZACIÓN RGB
// ================================
var rgbVis = {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 0.3
};

Map.addLayer(pre,rgbVis, 'RGB PRE (antes del incendio)');
Map.addLayer(post,rgbVis, 'RGB POST (despues del incendio)');



