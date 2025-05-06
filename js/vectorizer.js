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
     * Vectorise l'image en utilisant la méthode sélectionnée
     * @param {number} threshold - Valeur de seuil pour la binarisation
     * @param {number} simplification - Niveau de simplification des contours
     * @param {string} method - Méthode de vectorisation ('binarization' ou 'imagetracer')
     * @returns {Object} - Contours vectorisés
     */
    vectorize(threshold = this.threshold, simplification = this.simplificationTolerance, method = 'binarization') {
        this.threshold = threshold;
        this.simplificationTolerance = simplification;
        
        console.log(`Vectorisation avec méthode: ${method}, seuil: ${threshold}, simplification: ${simplification}`);
        
        // Choisir la méthode de vectorisation
        if (method === 'imagetracer') {
            return this.imageTracerVectorize(threshold, simplification);
        } else {
            // Méthode par défaut: binarisation directe
            return this.binarizationVectorize(threshold, simplification);
        }
    }
    
    /**
     * Méthode de vectorisation par binarisation directe
     * @param {number} threshold - Valeur de seuil pour la binarisation
     * @param {number} simplification - Niveau de simplification des contours
     * @returns {Promise} - Promise résolue avec les contours
     */
    binarizationVectorize(threshold, simplification) {
        console.log("Utilisation de la méthode de vectorisation par binarisation directe");
        
        return new Promise((resolve) => {
            // Étape 1: Binariser l'image
            const binaryData = this.applyThreshold(threshold);
            
            // Étape 2: Prétraiter l'image pour améliorer la qualité
            const processedData = this.preprocessImage(binaryData);
            
            // Étape 3: Convertir en tableau 2D binaire
            const binaryMatrix = [];
            for (let y = 0; y < this.height; y++) {
                const row = [];
                for (let x = 0; x < this.width; x++) {
                    const idx = (y * this.width + x) * 4;
                    // true = noir, false = blanc
                    row.push(processedData.data[idx] === 0);
                }
                binaryMatrix.push(row);
            }
            
            // Étape 4: Trouver les contours
            const contours = this.findBinaryContours(binaryMatrix);
            
            // Étape 5: Simplifier les contours
            const simplifyTolerance = Math.max(0.5, simplification / 4);
            const filteredContours = contours
                .filter(contour => contour.length >= 3)
                .map(contour => simplify(contour, simplifyTolerance))
                .filter(contour => 
                    contour.length >= 3 && !this.isFrameContour(contour)
                );
            
            // Étape 6: Dessiner l'aperçu
            this.drawVectorPreview(filteredContours);
            
            // Résoudre avec les contours
            resolve({
                contours: filteredContours,
                width: this.width,
                height: this.height
            });
        });
    }
    
    /**
     * Trouve les contours dans une image binaire par suivi de contour
     * @param {Array} binaryMatrix - Matrice binaire 2D (true = noir, false = blanc)
     * @returns {Array} - Tableau de contours
     */
    findBinaryContours(binaryMatrix) {
        const height = binaryMatrix.length;
        const width = binaryMatrix[0].length;
        const visited = Array(height).fill().map(() => Array(width).fill(false));
        const contours = [];
        
        // Directions pour le suivi de contour (8 directions)
        const directions = [
            [1, 0], [1, 1], [0, 1], [-1, 1],
            [-1, 0], [-1, -1], [0, -1], [1, -1]
        ];
        
        // Parcourir l'image
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Si pixel noir non visité
                if (binaryMatrix[y][x] && !visited[y][x]) {
                    // Vérifier si c'est un pixel de bord
                    let isBorder = false;
                    
                    // Un pixel est un bord s'il a au moins un voisin blanc
                    for (const [dx, dy] of directions) {
                        const nx = x + dx;
                        const ny = y + dy;
                        
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (!binaryMatrix[ny][nx]) {
                                isBorder = true;
                                break;
                            }
                        } else {
                            // Les pixels aux limites de l'image sont des bords
                            isBorder = true;
                            break;
                        }
                    }
                    
                    // Si c'est un bord, tracer le contour
                    if (isBorder) {
                        const contour = [];
                        let currentX = x;
                        let currentY = y;
                        const startX = x;
                        const startY = y;
                        
                        // Marquer comme visité
                        visited[currentY][currentX] = true;
                        contour.push({ x: currentX, y: currentY });
                        
                        // Suivre le contour
                        let foundNext = true;
                        while (foundNext) {
                            foundNext = false;
                            
                            // Essayer les 8 directions
                            for (const [dx, dy] of directions) {
                                const nx = currentX + dx;
                                const ny = currentY + dy;
                                
                                // Vérifier si c'est un pixel valide
                                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                    // Si pixel noir non visité
                                    if (binaryMatrix[ny][nx] && !visited[ny][nx]) {
                                        // Vérifier si c'est un bord
                                        let isNextBorder = false;
                                        for (const [ddx, ddy] of directions) {
                                            const nnx = nx + ddx;
                                            const nny = ny + ddy;
                                            
                                            if (nnx >= 0 && nnx < width && nny >= 0 && nny < height) {
                                                if (!binaryMatrix[nny][nnx]) {
                                                    isNextBorder = true;
                                                    break;
                                                }
                                            } else {
                                                isNextBorder = true;
                                                break;
                                            }
                                        }
                                        
                                        if (isNextBorder) {
                                            // Ajouter au contour
                                            currentX = nx;
                                            currentY = ny;
                                            visited[currentY][currentX] = true;
                                            contour.push({ x: currentX, y: currentY });
                                            foundNext = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            // Si on est revenu au point de départ, terminer
                            if (currentX === startX && currentY === startY) {
                                break;
                            }
                            
                            // Limiter la taille du contour pour éviter les boucles infinies
                            if (contour.length > 10000) {
                                break;
                            }
                        }
                        
                        // Fermer le contour si nécessaire
                        if (contour.length > 2 && 
                            (contour[0].x !== contour[contour.length - 1].x || 
                             contour[0].y !== contour[contour.length - 1].y)) {
                            contour.push({ ...contour[0] });
                        }
                        
                        // Ajouter le contour s'il est assez grand
                        if (contour.length >= 3) {
                            contours.push(contour);
                        }
                    }
                }
            }
        }
        
        return contours;
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

    /**
     * Méthode de vectorisation utilisant ImageTracer
     * @param {number} threshold - Valeur de seuil pour la binarisation
     * @param {number} simplification - Niveau de simplification des contours
     * @returns {Promise} - Promise résolue avec les contours
     */
    imageTracerVectorize(threshold, simplification) {
        console.log("Utilisation de la méthode ImageTracer pour la vectorisation");
        
        return new Promise((resolve, reject) => {
            try {
                // Étape 1: Binariser l'image
                const binaryData = this.applyThreshold(threshold);
                
                // Étape 2: Préparer les options pour ImageTracer
                const simplifyTolerance = Math.max(0.5, simplification / 2);
                const ltres = Math.max(1, 10 - simplification);
                const qtres = Math.max(1, 10 - simplification);
                
                const options = {
                    ltres: ltres,             // Seuil de ligne pour tracer les segments
                    qtres: qtres,             // Seuil de quadratique pour tracer les courbes
                    pathomit: 8,              // Omettre les chemins avec moins de points
                    rightangleenhance: true,  // Améliorer la détection des angles droits
                    colorsampling: 0,         // Pas d'échantillonnage de couleur
                    numberofcolors: 2,        // Noir et blanc seulement
                    mincolorratio: 0,         // Pas de filtrage de couleur
                    colorquantcycles: 1,      // Un seul cycle de quantification
                    layering: 0,              // Pas de calques
                    linefilter: true,         // Filtrer les lignes
                    strokewidth: 1            // Largeur de trait
                };
                
                // Étape 3: Convertir en SVG avec ImageTracer
                const svgString = ImageTracer.imagedataToSVG(binaryData, options);
                
                // Étape 4: Analyser le SVG pour extraire les contours
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
                const paths = svgDoc.querySelectorAll('path');
                
                const contours = [];
                
                // Étape 5: Extraire les chemins du SVG
                paths.forEach((path) => {
                    const pathData = path.getAttribute('d');
                    const contour = this.parseSVGPath(pathData);
                    
                    // Vérifier si le contour est valide
                    if (contour && contour.length >= 3) {
                        // Simplifier le contour si nécessaire
                        const simplified = simplify(contour, simplifyTolerance);
                        
                        // Vérifier si le contour n'est pas un cadre et est suffisamment grand
                        if (simplified.length >= 3 && !this.isFrameContour(simplified)) {
                            contours.push(simplified);
                        }
                    }
                });
                
                // Étape 6: Dessiner l'aperçu
                this.drawVectorPreview(contours);
                
                // Résoudre avec les contours
                resolve({
                    contours: contours,
                    width: this.width,
                    height: this.height
                });
            } catch (error) {
                console.error("Erreur avec ImageTracer:", error);
                console.log("Recours à la méthode par binarisation...");
                
                // Fallback vers la méthode directe
                this.binarizationVectorize(threshold, simplification)
                    .then(resolve)
                    .catch(reject);
            }
        });
    }
    
    /**
     * Analyse un chemin SVG et le convertit en contour
     * @param {string} path - Chaîne de données de chemin SVG
     * @returns {Array} - Contour extrait
     */
    parseSVGPath(path) {
        if (!path) return null;
        
        const contour = [];
        let currentX = 0;
        let currentY = 0;
        
        // Expression régulière pour extraire les commandes SVG
        const svgCommandRegex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
        let match;
        
        while ((match = svgCommandRegex.exec(path)) !== null) {
            const command = match[1];
            const params = match[2].trim().split(/[\s,]+/).filter(p => p !== '').map(parseFloat);
            
            switch (command) {
                case 'M': // MoveTo absolu
                    if (params.length >= 2) {
                        currentX = params[0];
                        currentY = params[1];
                        contour.push({ x: currentX, y: currentY });
                        
                        // Traiter les paires supplémentaires comme des LineTo
                        for (let i = 2; i < params.length; i += 2) {
                            if (i + 1 < params.length) {
                                currentX = params[i];
                                currentY = params[i + 1];
                                contour.push({ x: currentX, y: currentY });
                            }
                        }
                    }
                    break;
                
                case 'm': // MoveTo relatif
                    if (params.length >= 2) {
                        currentX += params[0];
                        currentY += params[1];
                        contour.push({ x: currentX, y: currentY });
                        
                        // Traiter les paires supplémentaires comme des LineTo relatifs
                        for (let i = 2; i < params.length; i += 2) {
                            if (i + 1 < params.length) {
                                currentX += params[i];
                                currentY += params[i + 1];
                                contour.push({ x: currentX, y: currentY });
                            }
                        }
                    }
                    break;
                
                case 'L': // LineTo absolu
                    for (let i = 0; i < params.length; i += 2) {
                        if (i + 1 < params.length) {
                            currentX = params[i];
                            currentY = params[i + 1];
                            contour.push({ x: currentX, y: currentY });
                        }
                    }
                    break;
                
                case 'l': // LineTo relatif
                    for (let i = 0; i < params.length; i += 2) {
                        if (i + 1 < params.length) {
                            currentX += params[i];
                            currentY += params[i + 1];
                            contour.push({ x: currentX, y: currentY });
                        }
                    }
                    break;
                
                case 'H': // Ligne horizontale absolue
                    for (let i = 0; i < params.length; i++) {
                        currentX = params[i];
                        contour.push({ x: currentX, y: currentY });
                    }
                    break;
                
                case 'h': // Ligne horizontale relative
                    for (let i = 0; i < params.length; i++) {
                        currentX += params[i];
                        contour.push({ x: currentX, y: currentY });
                    }
                    break;
                
                case 'V': // Ligne verticale absolue
                    for (let i = 0; i < params.length; i++) {
                        currentY = params[i];
                        contour.push({ x: currentX, y: currentY });
                    }
                    break;
                
                case 'v': // Ligne verticale relative
                    for (let i = 0; i < params.length; i++) {
                        currentY += params[i];
                        contour.push({ x: currentX, y: currentY });
                    }
                    break;
                
                case 'Z':
                case 'z': // Fermeture du chemin
                    // Si le contour est non vide, fermer en ajoutant le premier point
                    if (contour.length > 0) {
                        contour.push({ ...contour[0] });
                    }
                    break;
                
                // Pour les courbes, on pourrait ajouter des implémentations plus complexes
                // Mais pour l'instant, on ignore les commandes de courbe complexes
            }
        }
        
        return contour;
    }
}

// Exporter la classe
window.Vectorizer = Vectorizer; 