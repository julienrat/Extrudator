/**
 * Vectorizer - Module de vectorisation d'images
 */
class Vectorizer {
    constructor() {
        this.imageData = null;
        this.width = 0;
        this.height = 0;
        this.threshold = 128;
        this.simplificationTolerance = 5;
    }

    /**
     * Charge une image depuis un élément ou un fichier
     * @param {HTMLImageElement|File} source - Source de l'image
     * @returns {Promise} - Promise résolue quand l'image est chargée
     */
    loadImage(source) {
        return new Promise((resolve, reject) => {
            if (source instanceof File) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        this.processImage(img);
                        resolve(img);
                    };
                    img.onerror = () => reject(new Error("Erreur lors du chargement de l'image"));
                    img.src = event.target.result;
                };
                reader.onerror = () => reject(new Error("Erreur lors de la lecture du fichier"));
                reader.readAsDataURL(source);
            } else if (source instanceof HTMLImageElement) {
                if (source.complete) {
                    this.processImage(source);
                    resolve(source);
                } else {
                    source.onload = () => {
                        this.processImage(source);
                        resolve(source);
                    };
                    source.onerror = () => reject(new Error("Erreur lors du chargement de l'image"));
                }
            } else {
                reject(new Error("Source d'image non valide"));
            }
        });
    }

    /**
     * Traite une image pour extraire ses données
     * @param {HTMLImageElement} img - Image à traiter
     */
    processImage(img) {
        const canvas = document.createElement('canvas');
        this.width = canvas.width = img.width;
        this.height = canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        this.imageData = ctx.getImageData(0, 0, this.width, this.height);
        
        // Affiche l'image originale sur le canvas
        const originalCanvas = document.getElementById('original-canvas');
        originalCanvas.width = this.width;
        originalCanvas.height = this.height;
        originalCanvas.getContext('2d').drawImage(img, 0, 0);
    }

    /**
     * Applique un seuil à l'image pour la binariser
     * @param {number} threshold - Valeur de seuil (0-255)
     * @returns {ImageData} - Image binarisée
     */
    applyThreshold(threshold) {
        this.threshold = threshold;
        
        if (!this.imageData) {
            throw new Error("Aucune image chargée");
        }
        
        const binaryData = new Uint8ClampedArray(this.imageData.data.length);
        
        for (let i = 0; i < this.imageData.data.length; i += 4) {
            // Calcul de la luminosité (gris)
            const r = this.imageData.data[i];
            const g = this.imageData.data[i + 1];
            const b = this.imageData.data[i + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            
            // Appliquer le seuil
            const value = gray < threshold ? 0 : 255;
            
            binaryData[i] = binaryData[i + 1] = binaryData[i + 2] = value;
            binaryData[i + 3] = 255; // Alpha à 100%
        }
        
        return new ImageData(binaryData, this.width, this.height);
    }

    /**
     * Prétraitement de l'image pour améliorer la qualité de vectorisation
     * @param {ImageData} imageData - Données d'image à prétraiter
     * @returns {ImageData} - Image prétraitée
     */
    preprocessImage(imageData) {
        // Clone les données d'image
        const processed = new Uint8ClampedArray(imageData.data);
        const width = imageData.width;
        const height = imageData.height;
        
        // Réduction du bruit (filtre médian simple)
        const temp = new Uint8ClampedArray(processed.length);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                // Pour chaque pixel, prendre la médiane des 9 pixels environnants
                const neighbors = [];
                for (let ny = -1; ny <= 1; ny++) {
                    for (let nx = -1; nx <= 1; nx++) {
                        const nidx = ((y + ny) * width + (x + nx)) * 4;
                        neighbors.push(processed[nidx]);
                    }
                }
                
                // Trier et prendre la valeur médiane
                neighbors.sort((a, b) => a - b);
                const median = neighbors[4]; // 9/2 = 4.5, indice 4
                
                // Appliquer la médiane à tous les canaux
                temp[idx] = temp[idx + 1] = temp[idx + 2] = median;
                temp[idx + 3] = 255;
            }
        }
        
        // Blanchir les bords pour éviter le cadre noir
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Si le pixel est sur le bord (distance au bord < 2 pixels)
                if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
                    const idx = (y * width + x) * 4;
                    temp[idx] = temp[idx + 1] = temp[idx + 2] = 255; // blanc
                }
            }
        }
        
        return new ImageData(temp, width, height);
    }

    /**
     * Vérifie si un contour ressemble à un cadre (rectangle proche des dimensions de l'image)
     * @param {Array} contour - Contour à vérifier
     * @returns {boolean} - true si le contour est un cadre
     */
    isFrameContour(contour) {
        if (contour.length < 4) return false;
        
        // Trouver les min/max de x et y
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        contour.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        });
        
        // Calculer la largeur et hauteur du contour
        const width = maxX - minX;
        const height = maxY - minY;
        
        // Calculer la zone couverte par rapport à l'image entière
        const contourArea = width * height;
        const imageArea = this.width * this.height;
        const areaRatio = contourArea / imageArea;
        
        // Si le contour couvre plus de 90% de l'image et qu'il est proche des bords,
        // alors c'est probablement un cadre
        const isNearBorder = minX < 5 && minY < 5 && maxX > this.width - 5 && maxY > this.height - 5;
        
        return areaRatio > 0.90 && isNearBorder;
    }

    /**
     * Vectorise l'image en utilisant ImageTracer
     * @param {number} threshold - Valeur de seuil pour la binarisation
     * @param {number} simplification - Niveau de simplification des contours
     * @param {Object} advancedOptions - Options avancées supplémentaires
     * @returns {Object} - Contours vectorisés
     */
    vectorize(threshold = this.threshold, simplification = this.simplificationTolerance, advancedOptions = {}) {
        this.threshold = threshold;
        this.simplificationTolerance = simplification;
        
        // Binariser l'image
        const binaryData = this.applyThreshold(threshold);
        
        // Prétraiter l'image pour améliorer la qualité
        const processedData = this.preprocessImage(binaryData);
        
        // Créer un canvas temporaire pour l'image binarisée
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(processedData, 0, 0);
        
        return new Promise((resolve, reject) => {
            try {
                // Vérifier si ImageTracer est disponible
                if (typeof ImageTracer === 'undefined') {
                    console.warn("ImageTracer n'est pas disponible, utilisation de la méthode de secours");
                    return this.fallbackVectorize(threshold, simplification, advancedOptions).then(resolve).catch(reject);
                }
                
                // Options de base pour ImageTracer - utiliser les paramètres avancés si fournis
                const options = {
                    // Paramètres généraux de tracé (précision et simplification)
                    ltres: advancedOptions.ltres !== undefined ? advancedOptions.ltres : Math.max(0.1, (11 - simplification) / 10),
                    qtres: advancedOptions.qtres !== undefined ? advancedOptions.qtres : Math.max(0.1, (11 - simplification) / 10),
                    pathomit: advancedOptions.pathomit !== undefined ? advancedOptions.pathomit : Math.max(1, simplification),
                    
                    // Paramètres de filtre et nettoyage
                    turdsize: advancedOptions.turdsize !== undefined ? advancedOptions.turdsize : 2,
                    alphamax: advancedOptions.alphamax !== undefined ? advancedOptions.alphamax : 1,
                    
                    // Paramètres de flou
                    blurradius: advancedOptions.blurradius !== undefined ? advancedOptions.blurradius : 0,
                    blurdelta: advancedOptions.blurdelta !== undefined ? advancedOptions.blurdelta : 20,
                    
                    // Paramètres de détection
                    colorsampling: advancedOptions.colorsampling !== undefined ? advancedOptions.colorsampling : 0,
                    rightangleenhance: advancedOptions.rightangleenhance !== undefined ? advancedOptions.rightangleenhance : false,
                    
                    // Paramètres de préservation des trous
                    preserveholes: advancedOptions.preserveholes !== undefined ? advancedOptions.preserveholes : true,
                    
                    // Autres paramètres
                    numberofcolors: 2,
                    mincolorratio: 0,
                    colorquantcycles: 1,
                    opttolerance: advancedOptions.opttolerance !== undefined ? advancedOptions.opttolerance : 0.2,
                    strokewidth: advancedOptions.strokewidth !== undefined ? advancedOptions.strokewidth : 1,
                    
                    // Paramètres de sortie
                    layering: 0,
                    linefilter: true,
                    roundcoords: 1,
                    viewbox: true,
                    scale: 1
                };
                
                // Si un traitement de flou est demandé mais doit être appliqué différemment
                if ((options.blurradius > 0 || options.blurdelta < 100) && options.colorsampling === 0) {
                    // Créer un canvas temporaire pour appliquer le flou
                    const blurCanvas = document.createElement('canvas');
                    blurCanvas.width = this.width;
                    blurCanvas.height = this.height;
                    const blurCtx = blurCanvas.getContext('2d');
                    
                    // Dessiner l'image sur le canvas
                    blurCtx.putImageData(processedData, 0, 0);
                    
                    // Si blur radius est défini, appliquer un flou gaussien
                    if (options.blurradius > 0) {
                        blurCtx.filter = `blur(${options.blurradius}px)`;
                        blurCtx.drawImage(blurCanvas, 0, 0);
                    }
                    
                    // Récupérer l'image traitée
                    const blurredData = blurCtx.getImageData(0, 0, this.width, this.height);
                    
                    // Vectoriser l'image traitée
                    return this.vectorizeImageData(blurredData, options, simplification).then(resolve).catch(reject);
                } else {
                    // Vectoriser directement
                    return this.vectorizeImageData(processedData, options, simplification).then(resolve).catch(reject);
                }
            } catch (error) {
                console.error("Erreur générale de vectorisation:", error);
                this.fallbackVectorize(threshold, simplification, advancedOptions).then(resolve).catch(reject);
            }
        });
    }
    
    /**
     * Vectorisation de données d'image avec ImageTracer
     * @param {ImageData} imageData - Données d'image à vectoriser
     * @param {Object} options - Options de vectorisation
     * @param {number} simplification - Niveau de simplification
     * @returns {Promise} - Promise résolue avec les contours
     */
    vectorizeImageData(imageData, options, simplification) {
        return new Promise((resolve, reject) => {
            try {
                // Début de la vectorisation avec ImageTracer
                console.log("Vectorisation avec options:", options);
                const svgString = ImageTracer.imagedataToSVG(imageData, options);
                
                if (!svgString || svgString.length < 100) {
                    console.warn("SVG généré vide ou trop petit, utilisation de la méthode de secours");
                    return this.fallbackVectorize(this.threshold, simplification, options).then(resolve).catch(reject);
                }
                
                // Parser le SVG
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
                
                // Vérifier erreurs de parsing
                const parseError = svgDoc.querySelector("parsererror");
                if (parseError) {
                    console.warn("Erreur de parsing SVG:", parseError.textContent);
                    return this.fallbackVectorize(this.threshold, simplification, options).then(resolve).catch(reject);
                }
                
                const paths = svgDoc.querySelectorAll('path');
                let allContours = [];
                
                // Si pas de chemins, utiliser méthode de secours
                if (!paths || paths.length === 0) {
                    console.warn("Aucun chemin trouvé dans le SVG");
                    return this.fallbackVectorize(this.threshold, simplification, options).then(resolve).catch(reject);
                }
                
                paths.forEach(path => {
                    // Ignorer les paths blancs (fond) si on n'est pas en mode préservation des trous
                    const fillColor = path.getAttribute('fill');
                    const isWhite = fillColor === '#FFFFFF' || fillColor === 'white' || 
                                    fillColor === '#ffffff' || fillColor === 'rgb(255,255,255)';
                    
                    // Si c'est un chemin blanc et qu'on ne préserve pas les trous, l'ignorer
                    if (isWhite && !options.preserveholes) {
                        return;
                    }
                    
                    const d = path.getAttribute('d');
                    if (!d || d.trim().length === 0) return;
                    
                    // Analyser le chemin SVG
                    const points = this.parseSVGPath(d);
                    
                    // Vérifier si le contour est valide
                    if (points.length > 2) {
                        // Ajuster la tolérance en fonction du niveau de simplification
                        // Utiliser ltres/qtres comme guide pour la tolérance de simplification
                        const simplifyTolerance = options.ltres < 1 ? 
                            options.ltres / 2 : simplification / 20;
                        
                        // Simplifier les contours
                        const simplifiedPoints = simplify(points, simplifyTolerance);
                        
                        // Vérifier que le contour est valide après simplification
                        if (simplifiedPoints.length > 2 && !this.isFrameContour(simplifiedPoints)) {
                            // Si pathomit est défini, vérifier la taille minimale du contour
                            if (!options.pathomit || simplifiedPoints.length >= options.pathomit) {
                                // Ajouter un marqueur pour les trous (contours blancs)
                                allContours.push({
                                    points: simplifiedPoints,
                                    isHole: isWhite,
                                    area: this.calculateArea(simplifiedPoints)
                                });
                            }
                        }
                    }
                });
                
                // Trier les contours par aire (du plus grand au plus petit)
                allContours.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
                
                // Si aucun contour valide, utiliser méthode de secours
                if (allContours.length === 0) {
                    console.warn("Aucun contour valide après traitement SVG");
                    return this.fallbackVectorize(this.threshold, simplification, options).then(resolve).catch(reject);
                }
                
                // Organiser les contours pour gérer les trous si l'option est activée
                let contours = [];
                
                if (options.preserveholes) {
                    // Trouver le contour parent pour chaque trou potentiel
                    for (let i = 0; i < allContours.length; i++) {
                        if (allContours[i].isHole) {
                            // C'est un trou, trouver son parent
                            let foundParent = false;
                            for (let j = 0; j < allContours.length; j++) {
                                if (!allContours[j].isHole && this.isPointInContour(
                                    allContours[i].points[0], allContours[j].points)) {
                                    // Si ce contour n'a pas encore de trous, initialiser le tableau
                                    if (!allContours[j].holes) {
                                        allContours[j].holes = [];
                                    }
                                    // Ajouter ce trou à son parent
                                    allContours[j].holes.push(allContours[i].points);
                                    foundParent = true;
                                    break;
                                }
                            }
                            // Si aucun parent trouvé, traiter comme un contour normal mais inversé
                            if (!foundParent && allContours[i].points.length > 3) {
                                // Inverser le sens pour un trou isolé
                                contours.push(allContours[i].points.reverse());
                            }
                        } else {
                            // Contour normal (non trou)
                            contours.push(allContours[i].points);
                        }
                    }
                    
                    // Maintenant, ajouter les trous à la liste des contours mais avec un marqueur
                    for (let i = 0; i < allContours.length; i++) {
                        if (!allContours[i].isHole && allContours[i].holes && allContours[i].holes.length > 0) {
                            // Pour chaque trou, l'ajouter comme contour séparé avec un marqueur
                            for (let j = 0; j < allContours[i].holes.length; j++) {
                                // Inverser l'orientation des trous pour qu'ils soient correctement traités
                                contours.push(allContours[i].holes[j].reverse());
                            }
                        }
                    }
                } else {
                    // Si on ne préserve pas les trous, utiliser uniquement les contours noirs
                    contours = allContours.filter(c => !c.isHole).map(c => c.points);
                }
                
                // Dessiner l'aperçu vectorisé
                this.drawVectorPreview(contours);
                
                // Résoudre avec les contours trouvés
                resolve({
                    contours: contours,
                    width: this.width,
                    height: this.height
                });
            } catch (error) {
                console.error("Erreur dans vectorizeImageData:", error);
                this.fallbackVectorize(this.threshold, simplification, options).then(resolve).catch(reject);
            }
        });
    }
    
    /**
     * Calcule l'aire d'un polygone (utile pour trier et filtrer les contours)
     * @param {Array} contour - Points du contour
     * @returns {number} - Aire du polygone (négatif si orientation anti-horaire)
     */
    calculateArea(contour) {
        let area = 0;
        for (let i = 0; i < contour.length; i++) {
            const j = (i + 1) % contour.length;
            area += contour[i].x * contour[j].y;
            area -= contour[j].x * contour[i].y;
        }
        return area / 2;
    }
    
    /**
     * Vérifie si un point est à l'intérieur d'un contour
     * @param {Object} point - Point à tester {x, y}
     * @param {Array} contour - Contour sous forme de tableau de points {x, y}
     * @returns {boolean} - true si le point est à l'intérieur du contour
     */
    isPointInContour(point, contour) {
        // Algorithme ray-casting
        let inside = false;
        for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
            const xi = contour[i].x, yi = contour[i].y;
            const xj = contour[j].x, yj = contour[j].y;
            
            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    
    /**
     * Méthode de secours pour la vectorisation
     * @param {number} threshold - Valeur de seuil
     * @param {number} simplification - Niveau de simplification
     * @param {Object} advancedOptions - Options avancées supplémentaires
     * @returns {Promise} - Promise résolue avec les contours
     */
    fallbackVectorize(threshold, simplification, advancedOptions = {}) {
        console.log("Utilisation de la méthode de secours pour la vectorisation");
        
        return new Promise((resolve) => {
            // Binariser l'image
            const binaryData = this.applyThreshold(threshold);
            
            // Prétraiter l'image pour réduire le bruit
            let processedData = this.preprocessImage(binaryData);
            
            // Appliquer un flou si nécessaire
            if (advancedOptions.blurradius && advancedOptions.blurradius > 0) {
                // Créer un canvas temporaire pour le flou
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.width;
                tempCanvas.height = this.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                // Dessiner l'image sur le canvas
                tempCtx.putImageData(processedData, 0, 0);
                
                // Appliquer le flou
                tempCtx.filter = `blur(${advancedOptions.blurradius}px)`;
                tempCtx.drawImage(tempCanvas, 0, 0);
                
                // Récupérer les données floutées
                processedData = tempCtx.getImageData(0, 0, this.width, this.height);
            }
            
            // Déterminer si nous devons préserver les trous
            const preserveHoles = advancedOptions.preserveholes !== undefined ? 
                advancedOptions.preserveholes : true;
            
            // Créer deux tableaux 2D pour stocker les pixels noirs et blancs
            // Le padding aide à détecter les contours aux bords
            const paddedWidth = this.width + 4;
            const paddedHeight = this.height + 4;
            const binaryImage = Array(paddedHeight).fill().map(() => Array(paddedWidth).fill(false));
            
            // Si nous préservons les trous, nous devons également tracker les pixels blancs
            // pour détecter les contours intérieurs (trous)
            const invertedImage = preserveHoles ? 
                Array(paddedHeight).fill().map(() => Array(paddedWidth).fill(false)) : null;
            
            // Remplir le tableau avec les données d'image
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const idx = (y * this.width + x) * 4;
                    const isBlack = processedData.data[idx] === 0;
                    binaryImage[y + 2][x + 2] = isBlack; // true pour noir
                    
                    // Si nous préservons les trous, inverser l'image pour les contours intérieurs
                    if (preserveHoles) {
                        invertedImage[y + 2][x + 2] = !isBlack; // true pour blanc
                    }
                }
            }
            
            // Lisser l'image pour réduire les petits défauts
            const blurThreshold = advancedOptions.blurdelta !== undefined ? 
                Math.floor(advancedOptions.blurdelta / 10) : 2;
            const smoothedImage = this.smoothImage(binaryImage, paddedWidth, paddedHeight, blurThreshold);
            
            // Si nous préservons les trous, lisser également l'image inversée
            const smoothedInverted = preserveHoles ? 
                this.smoothImage(invertedImage, paddedWidth, paddedHeight, blurThreshold) : null;
            
            // Trouver les contours extérieurs (noirs)
            const externalContours = this.findContoursImproved(smoothedImage, paddedWidth, paddedHeight);
            
            // Ajuster les coordonnées pour compenser le padding
            const adjustedExternalContours = externalContours.map(contour => 
                contour.map(point => ({
                    x: point.x - 2,
                    y: point.y - 2
                }))
            );
            
            // Si nous préservons les trous, trouver les contours intérieurs (blancs)
            let adjustedInternalContours = [];
            if (preserveHoles && smoothedInverted) {
                const internalContours = this.findContoursImproved(
                    smoothedInverted, paddedWidth, paddedHeight, 
                    true // Marqueur pour indiquer que ce sont des contours intérieurs
                );
                
                adjustedInternalContours = internalContours.map(contour => 
                    contour.map(point => ({
                        x: point.x - 2,
                        y: point.y - 2
                    }))
                );
            }
            
            // Déterminer la taille minimale des formes (filtrer les petits contours)
            const turdsize = advancedOptions.turdsize !== undefined ? advancedOptions.turdsize : 2;
            
            // Utiliser ltres/qtres pour la tolérance de simplification
            const simplifyTolerance = advancedOptions.ltres !== undefined ?
                Math.max(0.3, advancedOptions.ltres) : 
                Math.max(0.5, (advancedOptions.alphamax || 1) * simplification / 5);
            
            // Traiter les contours extérieurs
            const filteredExternalContours = this.processContours(
                adjustedExternalContours, turdsize, simplifyTolerance, 
                advancedOptions.pathomit, false // isHole=false
            );
            
            // Traiter les contours intérieurs (trous)
            const filteredInternalContours = preserveHoles ? 
                this.processContours(
                    adjustedInternalContours, turdsize, simplifyTolerance, 
                    advancedOptions.pathomit, true // isHole=true
                ) : [];
            
            // Combiner tous les contours
            let allContours = [...filteredExternalContours];
            
            if (preserveHoles) {
                // Organiser les contours pour associer les trous à leurs parents
                let contoursWithHoles = this.organizeContours(
                    filteredExternalContours, filteredInternalContours
                );
                
                // Fusionner la liste finale
                allContours = contoursWithHoles;
            }
            
            // Dessiner l'aperçu
            this.drawVectorPreview(allContours);
            
            // Résoudre avec les contours trouvés
            resolve({
                contours: allContours,
                width: this.width,
                height: this.height
            });
        });
    }
    
    /**
     * Traite les contours pour filtrage et simplification
     * @param {Array} contours - Liste de contours à traiter
     * @param {number} turdsize - Taille minimale des formes
     * @param {number} simplifyTolerance - Tolérance pour la simplification
     * @param {number} pathomit - Taille minimale des chemins
     * @param {boolean} isHole - Indique si ce sont des trous (contours intérieurs)
     * @returns {Array} - Contours filtrés et simplifiés
     */
    processContours(contours, turdsize, simplifyTolerance, pathomit, isHole) {
        return contours
            // Filtrer selon la taille (turdsize)
            .filter(contour => {
                // Calculer l'aire approximative du contour
                let area = this.calculateArea(contour);
                
                // Pour les trous, l'aire est négative (orientation inverse)
                if (isHole) area = -area;
                
                return Math.abs(area) >= turdsize;
            })
            // Simplifier les contours
            .map(contour => simplify(contour, simplifyTolerance))
            // Filtrer les contours non valides ou qui ressemblent à des cadres
            .filter(contour => 
                contour.length >= 3 && 
                !this.isFrameContour(contour) &&
                // Appliquer pathomit si spécifié
                (!pathomit || contour.length >= pathomit)
            )
            // Inverser les trous pour avoir une orientation correcte
            .map(contour => isHole ? contour.reverse() : contour);
    }
    
    /**
     * Organise les contours en associant les trous à leurs parents
     * @param {Array} externalContours - Contours extérieurs
     * @param {Array} internalContours - Contours intérieurs (trous)
     * @returns {Array} - Liste finale de contours
     */
    organizeContours(externalContours, internalContours) {
        let result = [...externalContours];
        
        // Pour chaque trou, vérifier s'il est à l'intérieur d'un contour extérieur
        for (const hole of internalContours) {
            if (hole.length < 3) continue;
            
            // Prendre un point du trou pour le test
            const testPoint = hole[0];
            let foundParent = false;
            
            // Chercher un contour extérieur qui contient ce point
            for (const contour of externalContours) {
                if (this.isPointInContour(testPoint, contour)) {
                    // Ajouter ce trou à la liste des contours
                    result.push(hole);
                    foundParent = true;
                    break;
                }
            }
            
            // Si aucun parent trouvé, l'ajouter comme contour normal
            if (!foundParent) {
                result.push(hole);
            }
        }
        
        return result;
    }
    
    /**
     * Lisse l'image binaire pour améliorer la détection de contours
     * @param {Array} binaryImage - Image binaire 2D
     * @param {number} width - Largeur de l'image
     * @param {number} height - Hauteur de l'image
     * @param {number} threshold - Seuil pour le lissage
     * @returns {Array} - Image lissée
     */
    smoothImage(binaryImage, width, height, threshold = 2) {
        const result = Array(height).fill().map(() => Array(width).fill(false));
        
        // Pour chaque pixel (en évitant les bords)
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                // Compter les voisins noirs (connectivité 8)
                let blackCount = 0;
                
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (binaryImage[y + dy][x + dx]) {
                            blackCount++;
                        }
                    }
                }
                
                // Règles de lissage adaptatives en fonction du seuil
                if (binaryImage[y][x]) {
                    // Si pixel est noir, le garder si entouré d'au moins threshold pixels noirs
                    result[y][x] = blackCount > threshold;
                } else {
                    // Si pixel est blanc, le noircir s'il est entouré de beaucoup de pixels noirs
                    result[y][x] = blackCount >= (9 - threshold);
                }
            }
        }
        
        return result;
    }

    /**
     * Méthode améliorée pour trouver les contours
     * @param {Array} binaryImage - Image binaire 2D
     * @param {number} width - Largeur de l'image
     * @param {number} height - Hauteur de l'image
     * @param {boolean} isInverted - Indique si les contours sont inversés (trous)
     * @returns {Array} - Tableau de contours
     */
    findContoursImproved(binaryImage, width, height, isInverted = false) {
        // Tableau pour contours
        const contours = [];
        // Tableau pour marquer les pixels déjà visités
        const visited = Array(height).fill().map(() => Array(width).fill(false));
        
        // Directions: droite, bas, gauche, haut + diagonales
        const directions = [
            [1, 0], [1, 1], [0, 1], [-1, 1], 
            [-1, 0], [-1, -1], [0, -1], [1, -1]
        ];
        
        // Parcourir l'image
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                // Si c'est un pixel noir non visité qui est potentiellement un contour
                if (binaryImage[y][x] && !visited[y][x] && this.isPotentialBoundary(binaryImage, x, y, width, height)) {
                    // Tracer le contour
                    const contour = [];
                    let currentX = x;
                    let currentY = y;
                    
                    // Marquer comme point de départ
                    const startX = x;
                    const startY = y;
                    visited[currentY][currentX] = true;
                    contour.push({ x: currentX, y: currentY });
                    
                    // Chercher le prochain point du contour
                    let foundNext = false;
                    
                    do {
                        foundNext = false;
                        
                        // Essayer les 8 directions en commençant par la droite
                        for (let i = 0; i < 8 && !foundNext; i++) {
                            const [dx, dy] = directions[i];
                            const nextX = currentX + dx;
                            const nextY = currentY + dy;
                            
                            // Vérifier les limites
                            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
                                continue;
                            }
                            
                            // Vérifier si c'est un pixel noir non visité
                            if (binaryImage[nextY][nextX] && !visited[nextY][nextX]) {
                                // Vérifier si c'est un point de contour
                                if (this.isPotentialBoundary(binaryImage, nextX, nextY, width, height)) {
                                    // Marquer comme visité et ajouter au contour
                                    visited[nextY][nextX] = true;
                                    contour.push({ x: nextX, y: nextY });
                                    
                                    // Mettre à jour la position courante
                                    currentX = nextX;
                                    currentY = nextY;
                                    foundNext = true;
                                }
                            }
                        }
                        
                        // Si on est revenu au point de départ ou si on ne trouve plus de point suivant
                        if ((currentX === startX && currentY === startY) || !foundNext) {
                            break;
                        }
                        
                    } while (contour.length < 10000); // Limitation pour éviter boucles infinies
                    
                    // Ajouter le contour s'il est significatif
                    if (contour.length >= 3) {
                        // Fermer le contour si nécessaire
                        if (contour.length > 0 && 
                            (contour[0].x !== contour[contour.length - 1].x || 
                             contour[0].y !== contour[contour.length - 1].y)) {
                            contour.push({ ...contour[0] });
                        }
                        
                        // Inverser l'orientation pour les trous si nécessaire
                        contours.push(isInverted ? contour.reverse() : contour);
                    }
                }
            }
        }
        
        return contours;
    }
    
    /**
     * Vérifie si un pixel est potentiellement sur un contour
     * @param {Array} binaryImage - Image binaire 2D
     * @param {number} x - Coordonnée X
     * @param {number} y - Coordonnée Y
     * @param {number} width - Largeur de l'image
     * @param {number} height - Hauteur de l'image
     * @returns {boolean} - true si le pixel est potentiellement sur un contour
     */
    isPotentialBoundary(binaryImage, x, y, width, height) {
        // Vérifier les limites
        if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) {
            return false;
        }
        
        // Si le pixel n'est pas noir, ce n'est pas un contour
        if (!binaryImage[y][x]) {
            return false;
        }
        
        // Vérifier si le pixel a au moins un voisin blanc (connectivité 4)
        return !binaryImage[y-1][x] || // haut
               !binaryImage[y+1][x] || // bas
               !binaryImage[y][x-1] || // gauche
               !binaryImage[y][x+1];   // droite
    }

    /**
     * Parse un chemin SVG pour extraire les points
     * @param {string} d - Attribut d du chemin SVG
     * @returns {Array} - Points du contour
     */
    parseSVGPath(d) {
        try {
            // Regex améliorée pour capturer toutes les commandes SVG
            const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g) || [];
            const points = [];
            let currentX = 0;
            let currentY = 0;
            
            // Point de départ pour la fermeture du chemin
            let firstX = 0;
            let firstY = 0;
            let pathStarted = false;
            
            for (let i = 0; i < commands.length; i++) {
                const command = commands[i];
                const type = command.charAt(0);
                
                // Extraction sécurisée des arguments
                const args = command.slice(1)
                    .trim()
                    .split(/[\s,]+/)
                    .filter(arg => arg.length > 0)
                    .map(arg => parseFloat(arg));
                
                switch (type) {
                    case 'M': // MoveTo absolu
                        if (args.length >= 2) {
                            currentX = args[0];
                            currentY = args[1];
                            
                            // Stocker le premier point pour fermer le chemin
                            if (!pathStarted) {
                                firstX = currentX;
                                firstY = currentY;
                                pathStarted = true;
                            }
                            
                            points.push({ x: currentX, y: currentY });
                            
                            // Traiter les coordonnées additionnelles comme LineTo
                            for (let j = 2; j < args.length; j += 2) {
                                if (j + 1 < args.length) {
                                    currentX = args[j];
                                    currentY = args[j + 1];
                                    points.push({ x: currentX, y: currentY });
                                }
                            }
                        }
                        break;
                        
                    case 'm': // MoveTo relatif
                        if (args.length >= 2) {
                            // Si c'est le premier mouvement, on prend les coordonnées absolues
                            if (!pathStarted) {
                                currentX = args[0];
                                currentY = args[1];
                                firstX = currentX;
                                firstY = currentY;
                                pathStarted = true;
                            } else {
                                currentX += args[0];
                                currentY += args[1];
                            }
                            
                            points.push({ x: currentX, y: currentY });
                            
                            // Traiter les coordonnées additionnelles comme LineTo relatif
                            for (let j = 2; j < args.length; j += 2) {
                                if (j + 1 < args.length) {
                                    currentX += args[j];
                                    currentY += args[j + 1];
                                    points.push({ x: currentX, y: currentY });
                                }
                            }
                        }
                        break;
                        
                    case 'L': // LineTo absolu
                        for (let j = 0; j < args.length; j += 2) {
                            if (j + 1 < args.length) {
                                currentX = args[j];
                                currentY = args[j + 1];
                                points.push({ x: currentX, y: currentY });
                            }
                        }
                        break;
                        
                    case 'l': // LineTo relatif
                        for (let j = 0; j < args.length; j += 2) {
                            if (j + 1 < args.length) {
                                currentX += args[j];
                                currentY += args[j + 1];
                                points.push({ x: currentX, y: currentY });
                            }
                        }
                        break;
                        
                    case 'H': // Horizontal absolu
                        for (let j = 0; j < args.length; j++) {
                            currentX = args[j];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 'h': // Horizontal relatif
                        for (let j = 0; j < args.length; j++) {
                            currentX += args[j];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 'V': // Vertical absolu
                        for (let j = 0; j < args.length; j++) {
                            currentY = args[j];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 'v': // Vertical relatif
                        for (let j = 0; j < args.length; j++) {
                            currentY += args[j];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 'C': // Courbe cubique absolue
                        for (let j = 0; j < args.length; j += 6) {
                            if (j + 5 < args.length) {
                                // Approximation avec points intermédiaires
                                this.approximateCubicBezier(
                                    points, 
                                    currentX, currentY,
                                    args[j], args[j + 1],
                                    args[j + 2], args[j + 3],
                                    args[j + 4], args[j + 5]
                                );
                                
                                currentX = args[j + 4];
                                currentY = args[j + 5];
                            }
                        }
                        break;
                        
                    case 'c': // Courbe cubique relative
                        for (let j = 0; j < args.length; j += 6) {
                            if (j + 5 < args.length) {
                                // Approximation avec points intermédiaires
                                this.approximateCubicBezier(
                                    points,
                                    currentX, currentY,
                                    currentX + args[j], currentY + args[j + 1],
                                    currentX + args[j + 2], currentY + args[j + 3],
                                    currentX + args[j + 4], currentY + args[j + 5]
                                );
                                
                                currentX += args[j + 4];
                                currentY += args[j + 5];
                            }
                        }
                        break;
                        
                    case 'S': // Courbe cubique raccourcie absolue
                        // TODO: Meilleure implémentation
                        if (args.length >= 4) {
                            currentX = args[args.length - 2];
                            currentY = args[args.length - 1];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 's': // Courbe cubique raccourcie relative
                        // TODO: Meilleure implémentation
                        if (args.length >= 4) {
                            currentX += args[args.length - 2];
                            currentY += args[args.length - 1];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 'Q': // Courbe quadratique absolue
                        for (let j = 0; j < args.length; j += 4) {
                            if (j + 3 < args.length) {
                                // Approximation avec points intermédiaires
                                this.approximateQuadraticBezier(
                                    points,
                                    currentX, currentY,
                                    args[j], args[j + 1],
                                    args[j + 2], args[j + 3]
                                );
                                
                                currentX = args[j + 2];
                                currentY = args[j + 3];
                            }
                        }
                        break;
                        
                    case 'q': // Courbe quadratique relative
                        for (let j = 0; j < args.length; j += 4) {
                            if (j + 3 < args.length) {
                                // Approximation avec points intermédiaires
                                this.approximateQuadraticBezier(
                                    points,
                                    currentX, currentY,
                                    currentX + args[j], currentY + args[j + 1],
                                    currentX + args[j + 2], currentY + args[j + 3]
                                );
                                
                                currentX += args[j + 2];
                                currentY += args[j + 3];
                            }
                        }
                        break;
                        
                    case 'T': // Courbe quadratique raccourcie absolue
                        // TODO: Meilleure implémentation
                        if (args.length >= 2) {
                            currentX = args[args.length - 2];
                            currentY = args[args.length - 1];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 't': // Courbe quadratique raccourcie relative
                        // TODO: Meilleure implémentation
                        if (args.length >= 2) {
                            currentX += args[args.length - 2];
                            currentY += args[args.length - 1];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 'A': // Arc elliptique absolu
                        // TODO: Meilleure implémentation
                        if (args.length >= 7) {
                            currentX = args[args.length - 2];
                            currentY = args[args.length - 1];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 'a': // Arc elliptique relatif
                        // TODO: Meilleure implémentation
                        if (args.length >= 7) {
                            currentX += args[args.length - 2];
                            currentY += args[args.length - 1];
                            points.push({ x: currentX, y: currentY });
                        }
                        break;
                        
                    case 'Z': // Fermeture du chemin
                    case 'z':
                        if (pathStarted) {
                            // Vérifier si on est déjà au point de départ
                            if (Math.abs(currentX - firstX) > 0.1 || Math.abs(currentY - firstY) > 0.1) {
                                currentX = firstX;
                                currentY = firstY;
                                points.push({ x: currentX, y: currentY });
                            }
                        }
                        break;
                }
            }
            
            return points;
        } catch (error) {
            console.error("Erreur de parsing SVG:", error);
            return [];
        }
    }
    
    /**
     * Approxime une courbe de Bézier cubique par des segments de ligne
     * @param {Array} points - Tableau à remplir avec les points
     * @param {number} x0 - Point de départ X
     * @param {number} y0 - Point de départ Y
     * @param {number} x1 - Premier point de contrôle X
     * @param {number} y1 - Premier point de contrôle Y
     * @param {number} x2 - Deuxième point de contrôle X
     * @param {number} y2 - Deuxième point de contrôle Y
     * @param {number} x3 - Point d'arrivée X
     * @param {number} y3 - Point d'arrivée Y
     */
    approximateCubicBezier(points, x0, y0, x1, y1, x2, y2, x3, y3) {
        // Nombre de segments pour l'approximation (adapter selon la précision voulue)
        const segments = 10;
        
        // Ajouter des points intermédiaires
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const tt = t * t;
            const ttt = tt * t;
            const u = 1 - t;
            const uu = u * u;
            const uuu = uu * u;
            
            // Formule de Bézier cubique
            const x = uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3;
            const y = uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * y3;
            
            points.push({ x, y });
        }
    }
    
    /**
     * Approxime une courbe de Bézier quadratique par des segments de ligne
     * @param {Array} points - Tableau à remplir avec les points
     * @param {number} x0 - Point de départ X
     * @param {number} y0 - Point de départ Y
     * @param {number} x1 - Point de contrôle X
     * @param {number} y1 - Point de contrôle Y
     * @param {number} x2 - Point d'arrivée X
     * @param {number} y2 - Point d'arrivée Y
     */
    approximateQuadraticBezier(points, x0, y0, x1, y1, x2, y2) {
        // Nombre de segments pour l'approximation
        const segments = 8;
        
        // Ajouter des points intermédiaires
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const u = 1 - t;
            
            // Formule de Bézier quadratique
            const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
            const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
            
            points.push({ x, y });
        }
    }

    /**
     * Dessine un aperçu vectorisé sur le canvas
     * @param {Array} contours - Contours à dessiner
     */
    drawVectorPreview(contours) {
        const canvas = document.getElementById('vector-canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d');
        
        // Effacer le canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Dessiner un fond blanc
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Évaluer l'orientation des contours pour détecter les trous
        const analyzeContour = (contour) => {
            // Calculer le sens d'orientation (horaire/anti-horaire) du contour
            let area = 0;
            for (let i = 0; i < contour.length; i++) {
                const j = (i + 1) % contour.length;
                area += contour[i].x * contour[j].y;
                area -= contour[j].x * contour[i].y;
            }
            // Un area positif signifie une orientation anti-horaire (contour extérieur)
            // Un area négatif signifie une orientation horaire (contour intérieur = trou)
            return { 
                isHole: area < 0,
                area: Math.abs(area / 2)
            };
        };
        
        // Trier les contours par aire pour dessiner les plus grands d'abord
        const analyzedContours = contours.map(contour => ({
            contour,
            ...analyzeContour(contour)
        })).sort((a, b) => b.area - a.area);
        
        // Dessiner d'abord les contours extérieurs (non-trous)
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        for (const { contour, isHole } of analyzedContours) {
            if (contour.length < 2) continue;
            
            if (!isHole) {
                // Contour extérieur (noir)
                ctx.fillStyle = '#000000';
                ctx.strokeStyle = '#000000';
                
                ctx.beginPath();
                ctx.moveTo(contour[0].x, contour[0].y);
                
                for (let i = 1; i < contour.length; i++) {
                    ctx.lineTo(contour[i].x, contour[i].y);
                }
                
                ctx.fill();
                ctx.stroke();
            }
        }
        
        // Ensuite, dessiner les contours intérieurs (trous) en blanc
        for (const { contour, isHole } of analyzedContours) {
            if (contour.length < 2 || !isHole) continue;
            
            // Trou (blanc)
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#202020';
            
            ctx.beginPath();
            ctx.moveTo(contour[0].x, contour[0].y);
            
            for (let i = 1; i < contour.length; i++) {
                ctx.lineTo(contour[i].x, contour[i].y);
            }
            
            ctx.fill();
            ctx.stroke();
        }
        
        // Ajouter un message de diagnostic
        ctx.fillStyle = '#333333';
        ctx.font = '12px Arial';
        const holesCount = analyzedContours.filter(c => c.isHole).length;
        const shapesCount = analyzedContours.filter(c => !c.isHole).length;
        ctx.fillText(`Contours: ${shapesCount}, Trous: ${holesCount}`, 5, 15);
    }
}

// Exporter la classe
window.Vectorizer = Vectorizer; 