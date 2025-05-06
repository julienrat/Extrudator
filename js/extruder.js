/**
 * Extruder - Module d'extrusion 3D de contours vectorisés
 */
class Extruder {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.meshes = [];
        this.modelSize = 100; // Taille par défaut du modèle en mm
        this.animationId = null;
    }
    
    /**
     * Initialise la scène 3D
     */
    initScene() {
        // Créer la scène
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);
        
        // Créer la caméra
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
        this.camera.position.set(0, 0, 200);
        
        // Créer le renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Récupérer le conteneur et y ajouter le renderer
        const container = document.getElementById('model-preview');
        if (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        container.appendChild(this.renderer.domElement);
        
        // Ajuster la taille du renderer au conteneur
        const width = container.clientWidth;
        const height = container.clientHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        // Ajouter les contrôles pour la rotation et le zoom
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.25;
        this.controls.rotateSpeed = 0.35;
        
        // Ajouter des lumières
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight1.position.set(1, 1, 1);
        this.scene.add(directionalLight1);
        
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-1, -1, -1);
        this.scene.add(directionalLight2);
        
        // Démarrer la boucle d'animation
        this.animate();
        
        // Gérer le redimensionnement
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }
    
    /**
     * Nettoie la scène en supprimant tous les maillages
     */
    cleanup() {
        // Supprimer tous les maillages existants
        for (const mesh of this.meshes) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        }
        
        // Réinitialiser le tableau de maillages
        this.meshes = [];
    }
    
    /**
     * Crée un modèle 3D à partir des contours vectorisés
     * @param {Object} contourData - Données des contours (retour de Vectorizer.vectorize)
     * @param {number} height - Hauteur d'extrusion en mm
     * @returns {Object} - Mesh THREE.js du modèle
     */
    createModel(contourData, height = 10) {
        if (!contourData || !contourData.contours || contourData.contours.length === 0) {
            console.error("Aucun contour disponible pour la création du modèle");
            return null;
        }
        
        this.cleanup();
        
        // Créer un groupe pour contenir tous les maillages
        const group = new THREE.Group();
        this.scene.add(group);
        
        // Récupérer les dimensions d'origine
        const originalWidth = contourData.width;
        const originalHeight = contourData.height;
        
        // Définir l'échelle pour la conversion des unités (mm)
        const scale = this.modelSize / Math.max(originalWidth, originalHeight);
        
        // Analyser les contours pour distinguer extérieurs et trous
        const analyzeContour = (contour) => {
            // Calculer le sens d'orientation (horaire/anti-horaire) du contour
            let area = 0;
            for (let i = 0; i < contour.length; i++) {
                const j = (i + 1) % contour.length;
                area += contour[i].x * contour[j].y;
                area -= contour[j].x * contour[i].y;
            }
            return { 
                isHole: area < 0,
                area: Math.abs(area / 2),
                points: contour
            };
        };
        
        // Stocker les contours avec leur orientation
        const analyzedContours = contourData.contours.map(contour => analyzeContour(contour));
        
        // Trier par aire décroissante pour traiter les plus grandes formes d'abord
        analyzedContours.sort((a, b) => b.area - a.area);
        
        // Séparer les contours extérieurs et les trous
        const externalContours = analyzedContours.filter(c => !c.isHole);
        const holes = analyzedContours.filter(c => c.isHole);
        
        // Associer les trous à leurs contours parents
        const shapesWithHoles = [];
        
        for (const external of externalContours) {
            // Créer un objet pour cette forme
            const shape = {
                external: external.points,
                holes: []
            };
            
            // Trouver tous les trous à l'intérieur de ce contour
            for (const hole of holes) {
                // Vérifier si un point du trou est à l'intérieur du contour externe
                if (this.isPointInContour(hole.points[0], external.points)) {
                    shape.holes.push(hole.points);
                }
            }
            
            shapesWithHoles.push(shape);
        }
        
        // Retirer les contours qui n'ont pas une taille minimale
        const tinyShapeThreshold = 10; // pixels carrés
        const validShapes = shapesWithHoles.filter(shape => {
            const area = this.calculateContourArea(shape.external);
            return area > tinyShapeThreshold;
        });
        
        // Pour chaque forme, créer un maillage
        validShapes.forEach(shape => {
            try {
                // Créer une forme THREE.js avec les trous
                const threeShape = new THREE.Shape();
                
                // Ajouter le contour extérieur
                const firstPoint = shape.external[0];
                threeShape.moveTo(
                    (firstPoint.x - originalWidth / 2) * scale,
                    (originalHeight / 2 - firstPoint.y) * scale
                );
                
                for (let i = 1; i < shape.external.length; i++) {
                    const point = shape.external[i];
                    threeShape.lineTo(
                        (point.x - originalWidth / 2) * scale,
                        (originalHeight / 2 - point.y) * scale
                    );
                }
                
                // Ajouter les trous
                shape.holes.forEach(holePoints => {
                    const holePath = new THREE.Path();
                    
                    const firstHolePoint = holePoints[0];
                    holePath.moveTo(
                        (firstHolePoint.x - originalWidth / 2) * scale,
                        (originalHeight / 2 - firstHolePoint.y) * scale
                    );
                    
                    for (let i = 1; i < holePoints.length; i++) {
                        const point = holePoints[i];
                        holePath.lineTo(
                            (point.x - originalWidth / 2) * scale,
                            (originalHeight / 2 - point.y) * scale
                        );
                    }
                    
                    threeShape.holes.push(holePath);
                });
                
                // Créer la géométrie d'extrusion
                const extrudeSettings = {
                    steps: 1,
                    depth: height,
                    bevelEnabled: false
                };
                
                const geometry = new THREE.ExtrudeGeometry(threeShape, extrudeSettings);
                
                // Créer le matériau et le maillage
                const material = new THREE.MeshPhongMaterial({ 
                    color: 0x3f51b5,
                    shininess: 40,
                    flatShading: true
                });
                
                const mesh = new THREE.Mesh(geometry, material);
                
                // Stocker les contours originaux pour l'export DXF
                mesh.userData.contours = [shape.external, ...shape.holes];
                mesh.userData.imageHeight = originalHeight;
                
                // Ajouter au groupe
                group.add(mesh);
                
                // Stocker pour l'exportation
                this.meshes.push(mesh);
                
            } catch (error) {
                console.error("Erreur lors de la création du maillage:", error);
            }
        });
        
        // Repositionner la caméra pour voir tout le modèle
        this.resetCamera();
        
        return this.meshes.length > 0 ? this.meshes[0] : null;
    }
    
    /**
     * Calcule l'aire d'un polygone
     * @param {Array} contour - Points du contour
     * @returns {number} - Aire du polygone
     */
    calculateContourArea(contour) {
        let area = 0;
        for (let i = 0; i < contour.length; i++) {
            const j = (i + 1) % contour.length;
            area += contour[i].x * contour[j].y;
            area -= contour[j].x * contour[i].y;
        }
        return Math.abs(area / 2);
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
     * Réinitialise la caméra pour voir tout le modèle
     */
    resetCamera() {
        if (this.meshes.length === 0) return;
        
        // Créer une boîte englobante pour tous les maillages
        const box = new THREE.Box3();
        
        for (const mesh of this.meshes) {
            box.expandByObject(mesh);
        }
        
        // Calculer le centre et la taille de la boîte
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        // Ajuster la distance de la caméra pour voir tout le modèle
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let distance = maxDim / (2 * Math.tan(fov / 2));
        
        // Ajouter une marge pour être sûr de tout voir
        distance *= 1.5;
        
        // Positionner la caméra
        this.camera.position.set(0, 0, distance);
        this.controls.target.copy(center);
        
        // Mettre à jour les contrôles et la caméra
        this.controls.update();
        this.camera.updateProjectionMatrix();
    }
    
    /**
     * Exporte le modèle au format STL
     * @returns {Blob} - Blob contenant les données STL
     */
    exportSTL() {
        if (this.meshes.length === 0) {
            throw new Error("Aucun modèle à exporter");
        }
        
        // Créer un nouvel exporter STL
        const exporter = new THREE.STLExporter();
        
        // Si nous avons plusieurs maillages, créer un groupe
        let objectToExport;
        
        if (this.meshes.length === 1) {
            objectToExport = this.meshes[0];
        } else {
            // Créer un groupe temporaire
            const group = new THREE.Group();
            for (const mesh of this.meshes) {
                group.add(mesh.clone());
            }
            objectToExport = group;
        }
        
        // Exporter le modèle
        const stlString = exporter.parse(objectToExport);
        
        // Convertir la chaîne en Blob
        const blob = new Blob([stlString], { type: 'application/octet-stream' });
        
        return blob;
    }
    
    /**
     * Exporte les contours au format DXF
     * @returns {Blob} - Blob contenant les données DXF
     */
    exportDXF() {
        if (this.meshes.length === 0) {
            throw new Error("Aucun contour à exporter");
        }
        
        // Collecter tous les contours de tous les maillages
        const allContours = [];
        let imageHeight = 0;
        
        for (const mesh of this.meshes) {
            if (mesh.userData.contours) {
                allContours.push(...mesh.userData.contours);
                if (mesh.userData.imageHeight) {
                    imageHeight = mesh.userData.imageHeight;
                }
            }
        }
        
        if (allContours.length === 0) {
            throw new Error("Aucun contour disponible pour l'exportation DXF");
        }
        
        // Créer un nouveau document DXF
        const dxf = this.createDXF(allContours, imageHeight);
        
        // Convertir la chaîne en Blob
        const blob = new Blob([dxf], { type: 'application/dxf' });
        
        return blob;
    }
    
    /**
     * Crée un fichier DXF à partir des contours
     * @param {Array} contours - Liste des contours
     * @param {number} imageHeight - Hauteur de l'image d'origine
     * @returns {string} - Contenu du fichier DXF
     */
    createDXF(contours, imageHeight) {
        // Début du fichier DXF
        let dxf = '0\nSECTION\n2\nENTITIES\n';
        
        // Pour chaque contour, créer une polyligne
        contours.forEach(contour => {
            if (contour.length < 2) return;
            
            // Pour chaque point du contour, créer une entité LINE
            for (let i = 0; i < contour.length - 1; i++) {
                const startPoint = contour[i];
                const endPoint = contour[i + 1];
                
                // Inverser l'axe Y car DXF a l'origine en bas à gauche
                const y1 = imageHeight - startPoint.y;
                const y2 = imageHeight - endPoint.y;
                
                // Ajouter une entité LINE
                dxf += '0\nLINE\n';
                dxf += '8\n0\n'; // Calque 0
                dxf += `10\n${startPoint.x}\n`; // Point de départ X
                dxf += `20\n${y1}\n`; // Point de départ Y
                dxf += '30\n0\n'; // Point de départ Z
                dxf += `11\n${endPoint.x}\n`; // Point d'arrivée X
                dxf += `21\n${y2}\n`; // Point d'arrivée Y
                dxf += '31\n0\n'; // Point d'arrivée Z
            }
        });
        
        // Fin du fichier DXF
        dxf += '0\nENDSEC\n0\nEOF\n';
        
        return dxf;
    }
    
    /**
     * Gère le redimensionnement de la fenêtre
     */
    onWindowResize() {
        const container = document.getElementById('model-preview');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    /**
     * Boucle d'animation pour le rendu continu
     */
    animate() {
        this.animationId = requestAnimationFrame(this.animate.bind(this));
        
        if (this.controls) {
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Classe STLExporter simplifiée
// Basée sur https://github.com/mrdoob/three.js/blob/dev/examples/jsm/exporters/STLExporter.js
THREE.STLExporter = class {
    parse(scene, options) {
        options = options || {};
        
        const binary = options.binary !== undefined ? options.binary : false;
        
        // Convertir la scène en géométrie
        const meshes = [];
        scene.traverse(object => {
            if (object.isMesh && object.visible) {
                const geometry = object.geometry;
                const mesh = {
                    geometry: geometry,
                    matrix: object.matrixWorld
                };
                meshes.push(mesh);
            }
        });
        
        // Fonction pour traiter les triangles
        function handleTriangle(vertices, normal) {
            if (normal === undefined) {
                // Calculer la normale si elle n'est pas fournie
                const cb = new THREE.Vector3();
                const ab = new THREE.Vector3();
                const vA = vertices[0];
                const vB = vertices[1];
                const vC = vertices[2];
                
                cb.subVectors(vC, vB);
                ab.subVectors(vA, vB);
                cb.cross(ab).normalize();
                
                normal = cb;
            }
            
            return { vertices, normal };
        }
        
        // Fonction pour créer STL binaire
        function toBinarySTL(triangles) {
            const bufferSize = 84 + (50 * triangles.length);
            const buffer = new ArrayBuffer(bufferSize);
            const view = new DataView(buffer);
            
            // En-tête (80 octets)
            for (let i = 0; i < 80; i++) {
                view.setUint8(i, 0);
            }
            
            // Nombre de triangles
            view.setUint32(80, triangles.length, true);
            
            // Écrire chaque triangle
            let offset = 84;
            triangles.forEach(triangle => {
                const { vertices, normal } = triangle;
                
                // Normale
                view.setFloat32(offset, normal.x, true); offset += 4;
                view.setFloat32(offset, normal.y, true); offset += 4;
                view.setFloat32(offset, normal.z, true); offset += 4;
                
                // Vertices
                for (let i = 0; i < 3; i++) {
                    const vertex = vertices[i];
                    view.setFloat32(offset, vertex.x, true); offset += 4;
                    view.setFloat32(offset, vertex.y, true); offset += 4;
                    view.setFloat32(offset, vertex.z, true); offset += 4;
                }
                
                // Attribut (non utilisé)
                view.setUint16(offset, 0, true); offset += 2;
            });
            
            return buffer;
        }
        
        // Collecter tous les triangles
        const triangles = [];
        
        meshes.forEach(mesh => {
            const geometry = mesh.geometry;
            const matrixWorld = mesh.matrix;
            
            // Traitement selon le type de géométrie
            if (geometry.isBufferGeometry) {
                const positions = geometry.getAttribute('position');
                const normals = geometry.getAttribute('normal');
                
                if (positions) {
                    for (let i = 0; i < positions.count; i += 3) {
                        const vertices = [];
                        
                        for (let j = 0; j < 3; j++) {
                            const index = i + j;
                            
                            const vertex = new THREE.Vector3(
                                positions.getX(index),
                                positions.getY(index),
                                positions.getZ(index)
                            );
                            
                            vertex.applyMatrix4(matrixWorld);
                            vertices.push(vertex);
                        }
                        
                        let normal;
                        if (normals) {
                            // Utiliser la normale fournie
                            normal = new THREE.Vector3(
                                normals.getX(i),
                                normals.getY(i),
                                normals.getZ(i)
                            );
                            
                            normal.applyMatrix4(matrixWorld).normalize();
                        }
                        
                        triangles.push(handleTriangle(vertices, normal));
                    }
                }
            } else {
                console.warn('STLExporter: Geometry type not supported', geometry);
            }
        });
        
        if (binary) {
            return toBinarySTL(triangles);
        }
        
        // Note: ASCII STL n'est pas implémenté car nous utilisons uniquement le format binaire
        return null;
    }
};

// Exporter la classe
window.Extruder = Extruder; 