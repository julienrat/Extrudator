# Extrudator

Extrudator est une application web qui permet de vectoriser une image noir et blanc, l'extruder en 3D et l'exporter au format STL pour l'impression 3D.

## Fonctionnalités

- Chargement d'images
- Réglage du seuil noir/blanc pour la binarisation
- Vectorisation automatique des contours
- Simplification des contours vectorisés
- Extrusion 3D des formes vectorisées
- Prévisualisation 3D en temps réel
- Exportation au format STL

## Démo

Vous pouvez tester directement l'application sur la page GitHub Pages : [https://julienrat.github.io/Extrudator/](https://julienrat.github.io/Extrudator/)

## Installation

### Option 1 : En ligne

Accédez directement à [https://julienrat.github.io/Extrudator/](https://julienrat.github.io/Extrudator/)

### Option 2 : En local

1. Clonez ce dépôt :
   ```bash
   git clone https://github.com/julienrat/Extrudator.git
   ```
2. Ouvrez le fichier `index.html` dans votre navigateur

## Comment utiliser

1. Chargez une image noir et blanc en cliquant sur le bouton "Choisir une image"
2. Ajustez les paramètres :
   - **Seuil noir/blanc** : détermine quels pixels sont considérés comme noirs ou blancs
   - **Hauteur d'extrusion** : définit la hauteur du modèle 3D en millimètres
   - **Niveau de simplification** : réduit le nombre de points dans les contours vectorisés
3. Cliquez sur "Traiter l'image" pour lancer la vectorisation et l'extrusion
4. Prévisualisez votre modèle 3D (vous pouvez le faire pivoter avec la souris)
5. Cliquez sur "Exporter en STL" pour télécharger le fichier 3D

## Conseils pour de meilleurs résultats

- Utilisez des images avec des contrastes forts entre les zones noires et blanches
- Si le résultat n'est pas satisfaisant, ajustez le seuil noir/blanc
- Pour obtenir un fichier STL plus léger, augmentez le niveau de simplification
- Utilisez un niveau de simplification bas pour les images détaillées et élevé pour les images simples
- Vous pouvez modifier la hauteur d'extrusion à tout moment pour voir le résultat en temps réel

## Technologies utilisées

- HTML/CSS/JavaScript
- [Three.js](https://threejs.org/) pour le rendu 3D
- [ImageTracer.js](https://github.com/jankovicsandras/imagetracerjs) pour la vectorisation
- [Simplify.js](https://github.com/mourner/simplify-js) pour la simplification des contours
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) pour le téléchargement de fichiers

## Prétraitement des images

Extrudator intègre maintenant des fonctionnalités de prétraitement des images :
- Réduction de bruit avec un filtre médian
- Suppression automatique des cadres extérieurs indésirables
- Détection intelligente des contours

## Limitations

- Fonctionne uniquement avec des images noir et blanc ou à fort contraste
- Ne gère pas les images trop complexes ou avec trop de détails fins
- Performance limitée sur les appareils mobiles ou anciens
- Certains navigateurs peuvent avoir des restrictions sur l'utilisation de WebGL

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou à soumettre une pull request.

## Licence

Projet sous licence MIT. Libre d'utilisation pour des fins personnelles, éducatives et commerciales. 