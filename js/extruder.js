/**
 * Extruder - Module d'extrusion 3D
 */
class Extruder {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mesh = null;
        this.extrusionHeight = 10; // en mm
        this.animationId = null;
        this.isAnimating = false;
    }

    /**
     * Initialise la scène 3D avec Three.js
     */
    initScene() {
        // Arrêter l'animation en cours si elle existe
        this.stopAnimation();
        
        const container = document.getElementById('model-preview');
        
        // Nettoyer le conteneur
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        
        const width = container.clientWidth || 300;
        const height = container.clientHeight || 300;
        
        // Créer la scène
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf5f5f5);
        
        // Créer la caméra
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.z = 200;
        
        // Créer le renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Ajouter le renderer au conteneur
        container.appendChild(this.renderer.domElement);
        
        // Ajouter les contrôles orbitaux
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.25;
        
        // Ajouter de l'éclairage
        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);
        
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight1.position.set(1, 1, 1);
        this.scene.add(directionalLight1);
        
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
        directionalLight2.position.set(-1, -1, -1);
        this.scene.add(directionalLight2);
        
        // Gestion du redimensionnement
        const resizeHandler = () => {
            if (!this.renderer || !this.camera) return;
            
            const newWidth = container.clientWidth || 300;
            const newHeight = container.clientHeight || 300;
            
            this.camera.aspect = newWidth / newHeight;
            this.camera.updateProjectionMatrix();
            
            this.renderer.setSize(newWidth, newHeight);
        };
        
        // Supprimer les anciens écouteurs d'événements pour éviter les duplications
        window.removeEventListener('resize', resizeHandler);
        window.addEventListener('resize', resizeHandler);
        
        // Premier rendu
        this.renderScene();
        
        // Démarrer l'animation uniquement quand nous ajoutons un modèle
    }
    
    /**
     * Méthode sécurisée pour le rendu
     */
    renderScene() {
        if (this.scene && this.camera && this.renderer) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    /**
     * Démarre la boucle d'animation
     */
    startAnimation() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        
        const animate = () => {
            if (!this.isAnimating) return;
            
            this.animationId = requestAnimationFrame(animate);
            
            if (this.controls) {
                this.controls.update();
            }
            
            this.renderScene();
        };
        
        animate();
    }
    
    /**
     * Arrête la boucle d'animation
     */
    stopAnimation() {
        this.isAnimating = false;
        
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Crée un modèle 3D à partir de contours vectorisés
     * @param {Object} vectorData - Données vectorisées (contours, width, height)
     * @param {number} extrusionHeight - Hauteur d'extrusion en mm
     * @returns {THREE.Mesh} - Mesh 3D créé
     */
    createModel(vectorData, extrusionHeight) {
        this.extrusionHeight = extrusionHeight;
        
        // Initialiser la scène si elle n'existe pas déjà
        if (!this.scene) {
            this.initScene();
        }
        
        // Nettoyer tous les objets de la scène
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) {
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(m => m.dispose());
                } else {
                    this.mesh.material.dispose();
                }
            }
            this.mesh = null;
        }
        
        // Vérifier la validité des données
        if (!vectorData || !vectorData.contours || vectorData.contours.length === 0) {
            console.warn("Aucun contour valide à extruder");
            this.renderScene(); // Rendre la scène même sans nouveau modèle
            return null;
        }
        
        try {
            // Créer une forme 2D à partir des contours
            const shapes = this.createShapes(vectorData.contours, vectorData.height);
            
            if (shapes.length === 0) {
                console.warn("Aucune forme valide créée à partir des contours");
                this.renderScene(); // Rendre la scène même sans nouveau modèle
                return null;
            }
            
            // Paramètres d'extrusion
            const extrudeSettings = {
                steps: 1,
                depth: extrusionHeight,
                bevelEnabled: false
            };
            
            // Créer la géométrie extrudée
            const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
            
            // Centrer la géométrie
            geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            geometry.boundingBox.getCenter(center);
            geometry.translate(-center.x, -center.y, -extrusionHeight / 2);
            
            // Créer le matériau
            const material = new THREE.MeshStandardMaterial({
                color: 0x3498db,
                metalness: 0.2,
                roughness: 0.5,
                side: THREE.DoubleSide
            });
            
            // Créer le mesh
            this.mesh = new THREE.Mesh(geometry, material);
            
            // Ajouter le mesh à la scène
            this.scene.add(this.mesh);
            
            // Ajuster la caméra pour avoir une vue complète du modèle
            this.fitCameraToObject(this.mesh);
            
            // Démarrer l'animation maintenant que nous avons un modèle
            this.startAnimation();
            
            // Forcer un rendu immédiat
            this.renderScene();
            
            return this.mesh;
        } catch (error) {
            console.error("Erreur lors de la création du modèle 3D:", error);
            this.renderScene(); // Rendre la scène même en cas d'erreur
            return null;
        }
    }

    /**
     * Crée des formes Three.js à partir des contours vectorisés
     * @param {Array} contours - Contours vectorisés
     * @param {number} imageHeight - Hauteur de l'image originale pour inverser les coordonnées Y
     * @returns {Array} - Formes Three.js
     */
    createShapes(contours, imageHeight) {
        const shapes = [];
        
        // S'assurer que les contours sont valides
        if (!contours || !Array.isArray(contours)) {
            console.warn("Contours invalides");
            return shapes;
        }
        
        contours.forEach(contour => {
            if (!contour || contour.length < 3) return; // Ignorer les contours trop petits
            
            // Créer une nouvelle forme
            const shape = new THREE.Shape();
            
            // Inverser les coordonnées Y pour corriger l'orientation
            // Dans Three.js, Y+ pointe vers le haut, tandis que dans les images, Y+ pointe vers le bas
            const firstPoint = contour[0];
            shape.moveTo(firstPoint.x, imageHeight - firstPoint.y);
            
            // Ajouter les autres points
            for (let i = 1; i < contour.length; i++) {
                if (contour[i] && typeof contour[i].x === 'number' && typeof contour[i].y === 'number') {
                    shape.lineTo(contour[i].x, imageHeight - contour[i].y);
                }
            }
            
            // Fermer la forme
            shape.closePath();
            
            shapes.push(shape);
        });
        
        return shapes;
    }

    /**
     * Ajuste la caméra pour avoir une vue complète de l'objet
     * @param {THREE.Mesh} object - Objet à cadrer
     */
    fitCameraToObject(object) {
        if (!object || !this.camera || !this.controls) return;
        
        const boundingBox = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        
        boundingBox.getCenter(center);
        boundingBox.getSize(size);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        
        // Ajouter marge
        cameraZ *= 1.5;
        
        // Mise à jour de la position de la caméra
        this.camera.position.z = cameraZ;
        
        // Mise à jour de la cible des contrôles
        this.controls.target.copy(center);
        
        // Mise à jour des limites
        this.camera.near = Math.max(0.1, cameraZ / 100);
        this.camera.far = cameraZ * 10;
        this.camera.updateProjectionMatrix();
        
        this.controls.update();
    }

    /**
     * Exporte le modèle 3D en format STL
     * @returns {Blob} - Fichier STL en tant que Blob
     */
    exportSTL() {
        if (!this.mesh) {
            throw new Error("Aucun modèle à exporter");
        }
        
        // Créer un exportateur STL
        const exporter = new THREE.STLExporter();
        
        // Exporter le modèle
        const stlString = exporter.parse(this.mesh, { binary: true });
        
        // Créer un Blob à partir du résultat
        return new Blob([stlString], { type: 'application/octet-stream' });
    }
    
    // Nettoyer les ressources lors de la destruction
    cleanup() {
        this.stopAnimation();
        
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) {
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(m => m.dispose());
                } else {
                    this.mesh.material.dispose();
                }
            }
            this.mesh = null;
        }
        
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        
        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }
        
        this.scene = null;
        this.camera = null;
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