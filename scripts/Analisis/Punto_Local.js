
// INCENDIOS PNN CHINGAZA – dNBR SENTINEL-2
// Dataset: COPERNICUS/S2_SR_HARMONIZED



// 1. ROI DESDE WDPA
// ------------------------------------------------

// Cargar áreas protegidas mundiales
var wdpa = ee.FeatureCollection('WCMC/WDPA/current/polygons');

// Extraer geometría del PNN Chingaza
var roi = wdpa
  .filter(ee.Filter.stringContains('NAME', 'Chingaza'))
  .geometry();

// Visualización del ROI
Map.centerObject(roi, 10);
Map.addLayer(roi, {color: 'green'}, 'ROI - PNN Chingaza');


// 2. FUNCIÓN DE MÁSCARA DE NUBES (QA60)
// ------------------------------------------------

function maskS2clouds(image) {

  var qa = image.select('QA60');

  // Bits QA60:
  // bit 10 → nubes opacas
  // bit 11 → cirros
  var cloudBitMask  = 1 << 10;
  var cirrusBitMask = 1 << 11;

  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image
    .updateMask(mask)
    // Escalado a reflectancia física
    .divide(10000);
}


// 3. FUNCIÓN DE LIMPIEZA RADIOMÉTRICA (CRÍTICA)
// ------------------------------------------------
// Elimina sombras profundas, ruido extremo y valores no físicos

function cleanImage(image) {

  var nir  = image.select('B8');
  var swir = image.select('B12');

  // Umbrales compatibles con páramo / bosque altoandino
  var mask = nir.gt(0.005).and(nir.lt(0.8))
    .and(swir.gt(0.002)).and(swir.lt(0.6));

  return image.updateMask(mask);
}



// 4. SENTINEL-2 PRE INCENDIO
// ------------------------------------------------

var s2_pre = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  // Ventana corta y cercana al evento
  .filterDate('2024-12-15', '2025-01-13')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
  .map(maskS2clouds)
  .map(cleanImage);

var pre = s2_pre.median().clip(roi);


// 5. SENTINEL-2 POST INCENDIO
// ------------------------------------------------

var s2_post = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  // Se deja pasar tiempo para estabilización de cenizas
  .filterDate('2025-01-14', '2025-02-17')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
  .map(maskS2clouds)
  .map(cleanImage);

var post = s2_post.median().clip(roi);


// 6. VISUALIZACIÓN RGB / NIR / SWIR
// ------------------------------------------------

var rgbVis = {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 0.3
};

Map.addLayer(pre,  rgbVis, 'RGB PRE');
Map.addLayer(post, rgbVis, 'RGB POST');

Map.addLayer(pre.select('B8'),  {min:0, max:0.6}, 'NIR PRE');
Map.addLayer(post.select('B8'), {min:0, max:0.6}, 'NIR POST');

Map.addLayer(pre.select('B12'),  {min:0, max:0.6}, 'SWIR PRE');
Map.addLayer(post.select('B12'), {min:0, max:0.6}, 'SWIR POST');


// 7. CÁLCULO DE NBR Y dNBR
// ------------------------------------------------

var nbr_pre  = pre.normalizedDifference(['B8', 'B12']).rename('NBR_pre');
var nbr_post = post.normalizedDifference(['B8', 'B12']).rename('NBR_post');

var dNBR = nbr_pre.subtract(nbr_post).rename('dNBR');

// 8. VISUALIZACIÓN dNBR AJUSTADA (CIENTÍFICA)
// ------------------------------------------------

Map.addLayer(
  dNBR,
  {
    min: 0.15,
    max: 0.55,
    palette: ['yellow','orange','red','darkred']
  },
  'dNBR (severidad enfocada)'
);


// 9. MÁSCARA DE ÁREA QUEMADA REAL
// ------------------------------------------------
 dNBR = dNBR
  .reproject({
    crs: pre.select('B12').projection(),
    scale: 20
  });

var burned = dNBR.gt(0.27).rename('burned');

Map.addLayer(
  burned.updateMask(burned),
  {palette: ['red']},
  'Área quemada (dNBR > 0.27)'
);

var sev_low  = dNBR.gt(0.20).and(dNBR.lte(0.27));
var sev_mod  = dNBR.gt(0.27).and(dNBR.lte(0.44));
var sev_high = dNBR.gt(0.44);

Map.addLayer(sev_low.updateMask(sev_low),  {palette:['yellow']}, 'Severidad baja');
Map.addLayer(sev_mod.updateMask(sev_mod),  {palette:['orange']}, 'Severidad moderada');
Map.addLayer(sev_high.updateMask(sev_high),{palette:['red']},    'Severidad alta');

Map.addLayer(nbr_pre,  {min:-0.2, max:0.8, palette:['brown','yellow','green']}, 'NBR pre');
Map.addLayer(nbr_post, {min:-0.2, max:0.8, palette:['brown','yellow','green']}, 'NBR post');

// ------------------------------------------------------
// 11. ANÁLISIS LOCAL EN UNA ZONA PEQUEÑA (SIN CAMBIAR ROI)
// ------------------------------------------------------

// Punto de interés (coordenadas dadas)
var localPoint = ee.Geometry.Point(
  -73.7372789471579,
   4.530045570445559
);


var localBuffer = localPoint.buffer(1200);

// Visualización
Map.addLayer(localBuffer, {color: 'red'}, 'Zona local (buffer)');


// ------------------------------------------------------
// 11.1 NÚCLEO REAL DEL INCENDIO
// ------------------------------------------------------

var fire_core = dNBR.gt(0.20).selfMask();

Map.addLayer(
  fire_core,
  {palette:['darkred']},
  'Núcleo incendio (dNBR > 0.30)'
);

// Intersección física correcta
var local_fire = fire_core.clip(localBuffer);

Map.addLayer(
  local_fire,
  {palette:['red']},
  'Incendio dentro de zona local'
);

// ------------------------------------------------------
// 11.2 ÁREA TOTAL QUEMADA EN LA ZONA LOCAL
// ------------------------------------------------------

var localArea = local_fire
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: localBuffer,
    scale: 20,
    maxPixels: 1e8
  });

print(
  'Área quemada ZONA LOCAL (ha):',
  ee.Number(localArea.values().get(0)).divide(10000)
);

// ------------------------------------------------------
// 11.3 ÁREA POR SEVERIDAD (SOLO ZONA LOCAL)
// ------------------------------------------------------

function areaLocal(img, label) {
  var a = img
    .updateMask(fire_core)
    .clip(localBuffer)
    .multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: localBuffer,
      scale: 20,
      maxPixels: 1e8
    });

  print(label, ee.Number(a.values().get(0)).divide(10000));
}

areaLocal(sev_low,  'Área local severidad baja (ha)');
areaLocal(sev_mod,  'Área local severidad moderada (ha)');
areaLocal(sev_high, 'Área local severidad alta (ha)');
