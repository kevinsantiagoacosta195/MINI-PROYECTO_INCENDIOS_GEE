
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

//NBR= (NIR-SWIR)/(NIR+SWIR)

var dNBR = nbr_pre.subtract(nbr_post).rename('dNBR');

//dNBR= NBRpre-NBRpost

// 8. VISUALIZACIÓN dNBR 
// ------------------------------------------------

Map.addLayer(
  dNBR,
  {
    //Niveles de Severidad
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
