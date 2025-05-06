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
     * @returns {Object} - Contours vectorisés
     */
    vectorize(threshold = this.threshold, simplification = this.simplificationTolerance) {
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
                    return this.fallbackVectorize(threshold, simplification).then(resolve).catch(reject);
                }
                
                // Options avancées pour ImageTracer
                const options = {
                    // Paramètres généraux
                    ltres: Math.max(0.1, (11 - simplification) / 10),
                    qtres: Math.max(0.1, (11 - simplification) / 10),
                    pathomit: Math.max(1, simplification),
                    
                    // Paramètres pour meilleure détection
                    rightangleenhance: false,
                    colorsampling: 0,
                    numberofcolors: 2,
                    mincolorratio: 0,
                    colorquantcycles: 1,
                    
                    // Paramètres de sortie
                    layering: 0,
                    strokewidth: 1,
                    linefilter: true,
                    roundcoords: 1,
                    viewbox: true,
                    scale: 1
                };
                
                // Faire deux tentatives - une avec ImageTracer, une avec méthode de secours
                try {
                    const svgString = ImageTracer.imagedataToSVG(processedData, options);
                    
                    if (!svgString || svgString.length < 100) {
                        console.warn("SVG généré vide ou trop petit, utilisation de la méthode de secours");
                        return this.fallbackVectorize(threshold, simplification).then(resolve).catch(reject);
                    }
                    
                    // Parser le SVG
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
                    
                    // Vérifier erreurs de parsing
                    const parseError = svgDoc.querySelector("parsererror");
                    if (parseError) {
                        console.warn("Erreur de parsing SVG:", parseError.textContent);
                        return this.fallbackVectorize(threshold, simplification).then(resolve).catch(reject);
                    }
                    
                    const paths = svgDoc.querySelectorAll('path');
                    const contours = [];
                    
                    // Si pas de chemins, utiliser méthode de secours
                    if (!paths || paths.length === 0) {
                        console.warn("Aucun chemin trouvé dans le SVG");
                        return this.fallbackVectorize(threshold, simplification).then(resolve).catch(reject);
                    }
                    
                    paths.forEach(path => {
                        // Ignorer les paths blancs (fond)
                        const fillColor = path.getAttribute('fill');
                        if (fillColor === '#FFFFFF' || fillColor === 'white' || 
                            fillColor === '#ffffff' || fillColor === 'rgb(255,255,255)') {
                            return;
                        }
                        
                        const d = path.getAttribute('d');
                        if (!d || d.trim().length === 0) return;
                        
                        const points = this.parseSVGPath(d);
                        
                        // Vérifier si le contour est valide
                        if (points.length > 2) {
                            // Ajuster la tolérance en fonction du niveau de simplification
                            const simplifyTolerance = simplification < 5 ? 
                                simplification / 20 : simplification / 10;
                            
                            // Simplifier les contours
                            const simplifiedPoints = simplify(points, simplifyTolerance);
                            
                            // Vérifier que le contour est valide après simplification
                            if (simplifiedPoints.length > 2 && !this.isFrameContour(simplifiedPoints)) {
                                contours.push(simplifiedPoints);
                            }
                        }
                    });
                    
                    // Si aucun contour valide, utiliser méthode de secours
                    if (contours.length === 0) {
                        console.warn("Aucun contour valide après traitement SVG");
                        return this.fallbackVectorize(threshold, simplification).then(resolve).catch(reject);
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
                    console.error("Erreur lors du traitement SVG:", error);
                    this.fallbackVectorize(threshold, simplification).then(resolve).catch(reject);
                }
            } catch (error) {
                console.error("Erreur générale de vectorisation:", error);
                this.fallbackVectorize(threshold, simplification).then(resolve).catch(reject);
            }
        });
    }
    
    /**
     * Méthode de secours pour la vectorisation
     * @param {number} threshold - Valeur de seuil
     * @param {number} simplification - Niveau de simplification
     * @returns {Promise} - Promise résolue avec les contours
     */
    fallbackVectorize(threshold, simplification) {
        console.log("Utilisation de la méthode de secours pour la vectorisation");
        
        return new Promise((resolve) => {
            // Binariser l'image
            const binaryData = this.applyThreshold(threshold);
            
            // Prétraiter l'image pour réduire le bruit
            const processedData = this.preprocessImage(binaryData);
            
            // Créer un tableau 2D pour stocker les pixels binaires avec padding
            // Le padding aide à détecter les contours aux bords
            const paddedWidth = this.width + 4;
            const paddedHeight = this.height + 4;
            const binaryImage = Array(paddedHeight).fill().map(() => Array(paddedWidth).fill(false));
            
            // Remplir le tableau avec les données d'image
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const idx = (y * this.width + x) * 4;
                    binaryImage[y + 2][x + 2] = processedData.data[idx] === 0; // true pour noir
                }
            }
            
            // Amélioration: lisser l'image pour réduire les petits défauts
            const smoothedImage = this.smoothImage(binaryImage, paddedWidth, paddedHeight);
            
            // Trouver les contours
            const contours = this.findContoursImproved(smoothedImage, paddedWidth, paddedHeight);
            
            // Ajuster les coordonnées pour compenser le padding
            const adjustedContours = contours.map(contour => 
                contour.map(point => ({
                    x: point.x - 2,
                    y: point.y - 2
                }))
            );
            
            // Simplifier les contours avec une tolérance adaptée
            const simplifyTolerance = Math.max(0.5, simplification / 5);
            
            // Filtrer et simplifier
            const filteredContours = adjustedContours
                .filter(contour => contour.length >= 3) // Contours significatifs
                .map(contour => simplify(contour, simplifyTolerance))
                .filter(contour => 
                    contour.length >= 3 && // Contours significatifs après simplification
                    !this.isFrameContour(contour) // Ne pas inclure les cadres
                );
            
            // Dessiner l'aperçu
            this.drawVectorPreview(filteredContours);
            
            resolve({
                contours: filteredContours,
                width: this.width,
                height: this.height
            });
        });
    }
    
    /**
     * Lisse l'image binaire pour améliorer la détection de contours
     * @param {Array} binaryImage - Image binaire 2D
     * @param {number} width - Largeur de l'image
     * @param {number} height - Hauteur de l'image
     * @returns {Array} - Image lissée
     */
    smoothImage(binaryImage, width, height) {
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
                
                // Règles de lissage
                if (binaryImage[y][x]) {
                    // Si pixel est noir, le garder sauf si isolé
                    result[y][x] = blackCount > 1;
                } else {
                    // Si pixel est blanc, le noircir s'il est entouré de pixels noirs
                    result[y][x] = blackCount >= 6;
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
     * @returns {Array} - Tableau de contours
     */
    findContoursImproved(binaryImage, width, height) {
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
                        
                        contours.push(contour);
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
        
        // Dessiner les contours
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Dessiner chaque contour
        contours.forEach(contour => {
            if (contour.length < 2) return;
            
            ctx.beginPath();
            ctx.moveTo(contour[0].x, contour[0].y);
            
            for (let i = 1; i < contour.length; i++) {
                ctx.lineTo(contour[i].x, contour[i].y);
            }
            
            // Remplir et tracer les contours
            ctx.fill();
            ctx.stroke();
        });
        
        // Ajouter un message de diagnostic
        ctx.fillStyle = '#333333';
        ctx.font = '12px Arial';
        ctx.fillText(`Contours détectés: ${contours.length}`, 5, 15);
    }
}

// Exporter la classe
window.Vectorizer = Vectorizer; 