# MINI-PROYECTO_INCENDIOS_GEE
Este proyecto tiene objetivo el desarrollo de un algoritmo para la deteccion y mapeo de areas quemadas, utilizando imagenes Satelitales Opticas de Sentinel-2 y la plataforma Google Earth Engine (GEE).

---
## Metodologia
**Fecha:** 04/02/2026
**Tiempo Efectivo:**

**Objetivo:** Comprender la base espectral en la deteccion de areas quemadas usando Sentinel-2

**Conceptos:** NIR, SWIR, NBR, dNBR, Resolucion espectral

**Decisiones Tecnicas:** se prioriza el uso de dNBR respecto a NBR, ya que permite camptar cambios temporales en las respectivas areas asociadas a incendios

**Implementacion:**

1. Implementamos el dasets de Sentinel-2 en el GEE code
2. se hace uso de la mascara QA60, la cual sirve para decir que pixeles son confiables
3. apuntamos los bits especificos para observar pixeles sin nubes, usando los bits 10 y 11 (nivel low 0)
4. se incluye la coleccion de imagenes de copernicus, usando Surface Reflectance (SR)

  [Codigo Datasets](../scripts/data_preparation/datasets.js)
Fuente: https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED

5. Definimos nuestro ROI (Region of interest), Parque Nacional Natural de Chingaza
lo realizamos por medio de la base de datos de wpda, la cual se encuentra registrado el grupo de vectores de loas reservas naturales mundiales, a demas como se menciono fue definido a partir de FeatureCollection, y se convirtio a una geometria mediante el metodo ee.geometry(), con el fin de utilizar una delimitacion limpia. del mismo modo se recorta la imagen por medio de clip ()
[Chingaza](../scripts/data_preparation/Chingaza_WDPA.js)

6. Exportamos la imagen del GEE al Drive para visualizar la respectiva imagen generada

7. ubicamos una fecha, en la que hubieran habido incendios en PNN Chingaza y ubicamos una fecha de Pre-Incendio y Post-Incendio, para asi poder compararlos y realizar el respectivo analisis.
Por esto segun en Ministerio de ambiente  seleciono como fecha central el 15 de enero del 2025 en el cual cerca de 147 Hectares fueron afectada por incendio.  




**Resultados Preliminares**
**Dificultades**
**Proximo paso**

