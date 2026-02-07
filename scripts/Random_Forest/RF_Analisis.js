
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



// 2. FUNCIÓN DE MÁSCARA DE NUBES (QA60)
// ------------------------------------------------

function maskS2clouds(image) {

  var qa = image.select('QA60');

  // Bits QA60: mascara de calidad
  // bit 10 → nubes opacas
  // bit 11 → cirros
  var cloudBitMask  = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // establece como 0 para su respectiva filtracion
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
  var mask = nir.gt(0.005).and(nir.lt(0.8)) //0.005 elimina soombras profundas, 0.8 elimina nubes brillantes, etc
    .and(swir.gt(0.002)).and(swir.lt(0.6));//0.002 elimina agua, 0.6 elimina nubes gruesas

  return image.updateMask(mask); //aplica la mascara los pixeles que no cumplen la fisica espectral
}



// 4. SENTINEL-2 PRE INCENDIO
// ------------------------------------------------

var s2_pre = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  // Ventana corta y cercana al evento
  .filterDate('2024-12-15', '2025-01-13')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30)) // % Porcentaje de nubosidad conjunta
  .map(maskS2clouds) // llama la funcion de la banda QA60
  .map(cleanImage);// sombras profundas, ruido

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
  max: 0.3 //toda la informacion que nos interesan estan por debajo de 0.3 
};

// 7. CÁLCULO DE NBR Y dNBR
// ------------------------------------------------

var nbr_pre  = pre.normalizedDifference(['B8', 'B12']).rename('NBR_pre');
var nbr_post = post.normalizedDifference(['B8', 'B12']).rename('NBR_post');

var dNBR = nbr_pre.subtract(nbr_post).rename('dNBR');


// 8. MÁSCARA DE ÁREA QUEMADA REAL
// ------------------------------------------------
// Garantiza constancia espacial en la estimacion de areas quemada por eso usamos B12
 dNBR = dNBR
  .reproject({
    crs: pre.select('B12').projection(),
    scale: 20
  });

var burned = dNBR.gt(0.27).rename('burned');

//Umbrales USGS
var sev_low  = dNBR.gt(0.20).and(dNBR.lte(0.27));
var sev_mod  = dNBR.gt(0.27).and(dNBR.lte(0.44));
var sev_high = dNBR.gt(0.44);

// ------------------------------------------------------
// 11. ANÁLISIS LOCAL EN UNA ZONA PEQUEÑA (SIN CAMBIAR ROI)
// ------------------------------------------------------

// Punto de interés (coordenadas dadas)
var localPoint = ee.Geometry.Point(
  -73.7372789471579,
   4.530045570445559
);

//Crea un circulo de radio 1200m
var localBuffer = localPoint.buffer(1200);



// ------------------------------------------------------
// 11.1 NÚCLEO REAL DEL INCENDIO
// ------------------------------------------------------
//mantiene los pixeles donde la condicion (quemado) es verdadera
var fire_core = dNBR.gt(0.20).selfMask();


// Intersección física correcta, recorta la region local
var local_fire = fire_core.clip(localBuffer);


// ------------------------------------------------------
// 11.2 ÁREA TOTAL QUEMADA EN LA ZONA LOCAL
// ------------------------------------------------------

var localArea = local_fire
  .multiply(ee.Image.pixelArea()) //cada pixel tiene 400m2 sentinel-2 20mx20m
  //suma todos los pixeles donde hay incendio
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: localBuffer,
    scale: 20,
    maxPixels: 1e8
  });

print(
  'Área quemada ZONA LOCAL (ha):',
  ee.Number(localArea.values().get(0)).divide(10000) //convierte a hectareas
);

// ------------------------------------------------------
// 11.3 ÁREA POR SEVERIDAD (SOLO ZONA LOCAL)
// ------------------------------------------------------
//Mismo principio 
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

// 12. STACK ESPECTRAL
//es una imagen multibanda es lo que usa RF para decidir 
var rfStack = post 
  .select(['B2','B3','B4','B8','B11','B12'])
  .addBands(dNBR)
  .clip(roi);

// 13. CLASES DE ENTRENAMIENTO
var burnedClass = dNBR.gt(0.30); //quemado
var unburnedClass = dNBR.lt(0.10); //no quemado

// permite dejar solo las zonas quemadas como identificadas 
var classImage = ee.Image(0)
  .where(burnedClass, 1)
  .where(unburnedClass, 0)
  .rename('class')
  .updateMask(burnedClass.or(unburnedClass));


// 14. MUESTREO ESTRATIFICADO BALANCEADO
// vesctor de caracteristicas
var samples = rfStack
  .addBands(classImage)
  //toma de muestras
  .stratifiedSample({
    numPoints: 1,                 // OBLIGATORIO (dummy)
    classBand: 'class',           // Etiquetas
    classValues: [0, 1],
    classPoints: [300, 300],      //  balance real
    region: roi,
    scale: 20,
    seed: 42,
    geometries: true,
    dropNulls: true               //Elimina el ruido mejorarndo la calidad
  });
// el sample son 600 puntos y contiene las variables del rfstack
print('Muestras RF balanceadas', samples);

// 15. RANDOM FOREST PROBABILÍSTICO
//creacion de calsificador supervisado
var rfProb = ee.Classifier.smileRandomForest({
    numberOfTrees: 300, // 300 arboles independientes
    minLeafPopulation: 5,
    bagFraction: 0.7,
    seed: 42 //la aleatoridad
  })
  .setOutputMode('PROBABILITY') //devuelve umbrales en vez de high o low
  .train({
    features: samples,              
    classProperty: 'class',
    inputProperties: rfStack.bandNames()
  });

// 16. IMAGEN DE PROBABILIDAD DE INCENDIO
//Devuelve la probabilidad dad por el RF
//clasifica los quemados si son mayores a 0.5
var rfProbImage = rfStack.classify(rfProb);


// 17. RF BINARIO DERIVADO (umbral físico)
var rfBinary = rfProbImage.gt(0.5).rename('RF_burned');

// 18. RF SOLO EN ZONA LOCAL
var rfLocal = rfBinary.clip(localBuffer);


// 19. COMPARACIÓN RF VS dNBR NORMALIZADO
var dNBR_norm = dNBR.unitScale(0.15, 0.55);

var diff = rfProbImage
  .subtract(dNBR_norm)
  .rename('RF_minus_dNBR');

  //si diff es = 0, dNBR y RF concuerdan, di el diff es mayo a 0 RF detecto incendio y dNBR no
  // si diff es <0 dNBR alto y RF no convencido


// 20. VALIDACIÓN (RF vs dNBR)
var validation = rfStack
  .addBands(burned.rename('reference')) //es nuestro ground truth (informacion prcisa y verificada para entrenar modelos)
  .addBands(rfBinary.rename('classification'))
  .sample({
    region: roi,
    scale: 20,
    numPixels: 4000,
    seed: 1
  });

  //genera la matriz de confusion
var errorMatrix = validation.errorMatrix(
  'reference',
  'classification'
);

print('Matriz de confusión RF vs dNBR', errorMatrix);
// OA=TP+TN/TP+TN+FP+FN 
// TP: RF detecto incendio correcto
// TN: RF descarto correctamente
// FP: Falsas alarmas RF
// FN: Incendios que RF detecto
print('Exactitud global', errorMatrix.accuracy()); 
// k=po-pe/1-pe
//po=acuerdo observado
//pe=acuerdo esperado por azar
print('Kappa', errorMatrix.kappa());

// ==========================================
// VISUALIZACIÓN FINAL (MINI-PROYECTO LIMPIO)
// ==========================================

// 1. ROI – contexto espacial
Map.centerObject(roi, 10);
Map.addLayer(
  roi,
  {color: 'green'},
  'PNN Chingaza (ROI)'
);

// 2. Sentinel-2 RGB POST incendio (evidencia directa)
Map.addLayer(
  post,
  {
    bands: ['B4', 'B3', 'B2'],
    min: 0,
    max: 0.3
  },
  'Sentinel-2 RGB POST'
);

// 3. dNBR – severidad del incendio
Map.addLayer(
  dNBR,
  {
    min: 0.15,
    max: 0.55,
    palette: ['yellow','orange','red','darkred']
  },
  'dNBR (severidad)'
);

// 4. Área quemada física (dNBR > 0.27)
Map.addLayer(
  burned.updateMask(burned),
  {palette: ['red']},
  'Área quemada (dNBR > 0.27)'
);

// 5. Zona local de análisis (~100 ha)
Map.addLayer(
  localBuffer,
  {color: 'blue'},
  'Zona local de análisis'
);

// 6. Random Forest binario (refinamiento espectral)
Map.addLayer(
  rfBinary.updateMask(rfBinary),
  {palette: ['cyan']},
  'RF - área quemada'
);

// 7. Diferencia RF vs dNBR (consistencia)
Map.addLayer(
  diff,
  {
    min: -1,
    max: 1,
    palette: ['red', 'white', 'green']
  },
  'RF - dNBR (diferencia)'
);
