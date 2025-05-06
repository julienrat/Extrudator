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