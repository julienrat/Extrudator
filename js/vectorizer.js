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
        
        // Vérifier si ImageTracer est disponible
        if (typeof ImageTracer === 'undefined') {
            console.error("La bibliothèque ImageTracer n'est pas chargée");
            return this.fallbackVectorize(threshold, simplification);
        }
        
        // Binariser l'image
        const binaryData = this.applyThreshold(threshold);
        
        // Prétraiter l'image pour améliorer la qualité
        const processedData = this.preprocessImage(binaryData);
        
        // Créer un canvas temporaire pour l'image binarisée
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        tempCanvas.getContext('2d').putImageData(processedData, 0, 0);
        
        return new Promise((resolve, reject) => {
            try {
                // Options avancées pour ImageTracer
                // Ajuster les paramètres en fonction des besoins de qualité vs. simplicité
                const presets = {
                    // Préréglage pour les images simples avec peu de détails
                    simple: {
                        ltres: 1,         // Haute précision pour lignes (1-10)
                        qtres: 1,         // Haute précision pour courbes (1-10)
                        pathomit: 8,      // Éliminer petits chemins < 8px
                        rightangleenhance: true,
                        colorsampling: 0, // Désactiver échantillonnage (image déjà binarisée)
                        numberofcolors: 2,
                        mincolorratio: 0,
                        colorquantcycles: 1,
                        layering: 0,
                        strokewidth: 1,
                        linefilter: true,
                        roundcoords: 1,
                        desc: false,
                        viewbox: true,
                        scale: 1
                    },
                    // Préréglage pour les images avec des détails fins
                    detailed: {
                        ltres: 0.1,       // Très haute précision pour lignes
                        qtres: 0.1,       // Très haute précision pour courbes
                        pathomit: 0,      // Ne pas éliminer de chemins
                        rightangleenhance: false,
                        colorsampling: 0,
                        numberofcolors: 2,
                        mincolorratio: 0,
                        colorquantcycles: 1,
                        layering: 0,
                        strokewidth: 0,
                        linefilter: false,
                        roundcoords: 1,
                        desc: false,
                        viewbox: true,
                        scale: 1
                    }
                };
                
                // Choisir le préréglage en fonction du niveau de simplification
                const options = simplification > 5 ? presets.simple : presets.detailed;
                
                // Ajuster les paramètres en fonction du niveau de simplification spécifique
                options.ltres = Math.max(0.1, (11 - simplification) / 10);
                options.qtres = Math.max(0.1, (11 - simplification) / 10);
                options.pathomit = simplification;
                
                // Utiliser directement imagedataToSVG au lieu de imageToSVG
                // car imageToSVG attend une URL et non un canvas
                const svgString = ImageTracer.imagedataToSVG(processedData, options);
                
                try {
                    // Convertir le SVG en contours
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
                    const paths = svgDoc.querySelectorAll('path');
                    
                    // Extraire les contours
                    const contours = [];
                    
                    paths.forEach(path => {
                        // Ignorer les paths blancs (fond)
                        const fillColor = path.getAttribute('fill');
                        if (fillColor === '#FFFFFF' || fillColor === 'white' || 
                            fillColor === '#ffffff' || fillColor === 'rgb(255,255,255)') {
                            return;
                        }
                        
                        const d = path.getAttribute('d');
                        if (d) {
                            const points = this.parseSVGPath(d);
                            
                            // Ne garder que les contours avec suffisamment de points
                            if (points.length > 2) {
                                // Simplifier les contours avec une tolérance adaptée
                                const simplifyTolerance = simplification < 5 ? 
                                    this.simplificationTolerance / 20 : 
                                    this.simplificationTolerance / 10;
                                
                                const simplifiedPoints = simplify(points, simplifyTolerance);
                                
                                // Ne pas ajouter les contours qui ressemblent à un cadre
                                if (!this.isFrameContour(simplifiedPoints)) {
                                    contours.push(simplifiedPoints);
                                }
                            }
                        }
                    });
                    
                    // Dessiner l'aperçu vectorisé
                    this.drawVectorPreview(contours);
                    
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
                console.error("Erreur lors de l'utilisation d'ImageTracer:", error);
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
            
            // Créer un tableau 2D pour stocker les pixels binaires
            const binaryImage = [];
            for (let y = 0; y < this.height; y++) {
                binaryImage[y] = [];
                for (let x = 0; x < this.width; x++) {
                    const idx = (y * this.width + x) * 4;
                    binaryImage[y][x] = processedData.data[idx] === 0; // true pour noir
                }
            }
            
            // Trouver les contours avec l'algorithme de détection de contours
            const contours = this.findContours(binaryImage);
            
            // Simplifier les contours avec une tolérance adaptée au niveau de simplification
            const simplifyTolerance = simplification < 5 ? simplification / 10 : simplification / 5;
            
            // Filtrer les contours qui ressemblent à un cadre
            const filteredContours = contours
                .map(contour => simplify(contour, simplifyTolerance))
                .filter(contour => !this.isFrameContour(contour));
            
            // Dessiner les contours
            this.drawVectorPreview(filteredContours);
            
            resolve({
                contours: filteredContours,
                width: this.width,
                height: this.height
            });
        });
    }
    
    /**
     * Algorithme simple de détection de contours
     * @param {Array} binaryImage - Image binaire 2D
     * @returns {Array} - Tableau de contours
     */
    findContours(binaryImage) {
        const contours = [];
        const visited = Array(this.height).fill().map(() => Array(this.width).fill(false));
        
        // Parcourir l'image pour trouver les pixels noirs
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (binaryImage[y][x] && !visited[y][x]) {
                    // Pixel noir non visité, commencer un nouveau contour
                    const contour = this.traceContour(binaryImage, visited, x, y);
                    if (contour.length > 2) {
                        contours.push(contour);
                    }
                }
            }
        }
        
        return contours;
    }
    
    /**
     * Trace un contour à partir d'un point de départ
     * @param {Array} binaryImage - Image binaire 2D
     * @param {Array} visited - Tableau de pixels visités
     * @param {number} startX - Position X de départ
     * @param {number} startY - Position Y de départ
     * @returns {Array} - Contour trouvé
     */
    traceContour(binaryImage, visited, startX, startY) {
        const contour = [];
        const directions = [
            [0, -1], [1, -1], [1, 0], [1, 1], 
            [0, 1], [-1, 1], [-1, 0], [-1, -1]
        ];
        
        let x = startX;
        let y = startY;
        let dir = 0; // Direction initiale
        
        do {
            visited[y][x] = true;
            contour.push({ x, y });
            
            // Chercher un pixel noir dans les directions voisines
            let found = false;
            let count = 0;
            
            while (!found && count < 8) {
                const nextDir = (dir + count) % 8;
                const [dx, dy] = directions[nextDir];
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && 
                    binaryImage[ny][nx] && !visited[ny][nx]) {
                    x = nx;
                    y = ny;
                    dir = nextDir;
                    found = true;
                }
                
                count++;
            }
            
            if (!found) {
                break;
            }
            
        } while (x !== startX || y !== startY);
        
        return contour;
    }

    /**
     * Parse un chemin SVG pour extraire les points
     * @param {string} d - Attribut d du chemin SVG
     * @returns {Array} - Points du contour
     */
    parseSVGPath(d) {
        // Cette fonction simplifie le chemin SVG en points
        // Elle est basique et ne gère pas tous les cas complexes
        const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g) || [];
        const points = [];
        let currentX = 0;
        let currentY = 0;
        
        commands.forEach(command => {
            const type = command.charAt(0);
            const args = command.slice(1)
                .trim()
                .split(/[\s,]+/)
                .map(arg => parseFloat(arg));
            
            switch (type) {
                case 'M': // MoveTo absolu
                    currentX = args[0];
                    currentY = args[1];
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                case 'm': // MoveTo relatif
                    currentX += args[0];
                    currentY += args[1];
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                case 'L': // LineTo absolu
                    currentX = args[0];
                    currentY = args[1];
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                case 'l': // LineTo relatif
                    currentX += args[0];
                    currentY += args[1];
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                case 'H': // Horizontal absolu
                    currentX = args[0];
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                case 'h': // Horizontal relatif
                    currentX += args[0];
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                case 'V': // Vertical absolu
                    currentY = args[0];
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                case 'v': // Vertical relatif
                    currentY += args[0];
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                // Les autres types (courbes) sont simplifiés en lignes droites
                case 'C': // CurveTo cubique absolu
                case 'c': // CurveTo cubique relatif
                case 'S': // ShorthandCurveTo cubique absolu
                case 's': // ShorthandCurveTo cubique relatif
                case 'Q': // CurveTo quadratique absolu
                case 'q': // CurveTo quadratique relatif
                case 'T': // ShorthandCurveTo quadratique absolu
                case 't': // ShorthandCurveTo quadratique relatif
                case 'A': // Arc absolu
                case 'a': // Arc relatif
                    // Simplification: on ne prend que le point final
                    if (type === 'C' || type === 'S') {
                        currentX = args[args.length - 2];
                        currentY = args[args.length - 1];
                    } else if (type === 'c' || type === 's') {
                        currentX += args[args.length - 2];
                        currentY += args[args.length - 1];
                    } else if (type === 'Q' || type === 'T') {
                        currentX = args[args.length - 2];
                        currentY = args[args.length - 1];
                    } else if (type === 'q' || type === 't') {
                        currentX += args[args.length - 2];
                        currentY += args[args.length - 1];
                    } else if (type === 'A') {
                        currentX = args[5];
                        currentY = args[6];
                    } else if (type === 'a') {
                        currentX += args[5];
                        currentY += args[6];
                    }
                    points.push({ x: currentX, y: currentY });
                    break;
                    
                case 'Z': // ClosePath
                case 'z':
                    // Fermer le chemin en revenant au premier point
                    if (points.length > 0) {
                        points.push({ ...points[0] });
                    }
                    break;
            }
        });
        
        return points;
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
        
        // Dessiner les contours
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
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
    }
}

// Exporter la classe
window.Vectorizer = Vectorizer; 