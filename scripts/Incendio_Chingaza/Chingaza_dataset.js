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


// 3. CARGAR SENTINEL-2
// ================================
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')

  // FILTRO ESPACIAL
  .filterBounds(roi)

  // FILTRO TEMPORAL
  .filterDate('2024-11-01', '2025-03-01')

  // FILTRO DE NUBOSIDAD GLOBAL
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))

  // APLICAR LIMPIEZA DE NUBES
  .map(maskS2clouds);


// 4. CREAR IMAGEN COMPUESTA
// ================================
var image = s2
  .median()
  .clip(roi);


// 5. VISUALIZACIÓN RGB
// ================================
var rgbVis = {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 0.3
};

Map.addLayer(image, rgbVis, 'Sentinel-2 RGB');


// 6. EXPORTAR IMAGEN A GOOGLE DRIVE
// ================================

Export.image.toDrive({
  image: image,
  description: 'Sentinel2_Chingaza_RGB',
  folder: 'GEE_exports',
  fileNamePrefix: 'S2_Chingaza_RGB_2024_2025',
  region: roi,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
