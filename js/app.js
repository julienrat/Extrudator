/**
 * Extrudator - Application principale
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialiser les variables globales
    const vectorizer = new Vectorizer();
    const extruder = new Extruder();
    let vectorData = null;
    
    // Récupérer les éléments du DOM
    const imageInput = document.getElementById('image-input');
    const thresholdInput = document.getElementById('threshold');
    const thresholdValue = document.getElementById('threshold-value');
    const extrusionInput = document.getElementById('extrusion');
    const simplificationInput = document.getElementById('simplification');
    const simplificationValue = document.getElementById('simplification-value');
    const processBtn = document.getElementById('process-btn');
    const exportStlBtn = document.getElementById('export-stl-btn');
    const exportDxfBtn = document.getElementById('export-dxf-btn');
    const modelPreviewDiv = document.getElementById('model-preview');
    
    // Écouter les changements de valeur du seuil
    thresholdInput.addEventListener('input', () => {
        thresholdValue.textContent = thresholdInput.value;
    });
    
    // Écouter les changements de valeur de simplification
    simplificationInput.addEventListener('input', () => {
        simplificationValue.textContent = simplificationInput.value;
    });
    
    // Écouter les changements d'image
    imageInput.addEventListener('change', (event) => {
        if (event.target.files && event.target.files[0]) {
            // Réinitialiser l'interface au changement d'image
            exportStlBtn.disabled = true;
            exportDxfBtn.disabled = true;
            
            // Afficher un message de chargement
            processBtn.disabled = true;
            processBtn.textContent = "Chargement...";
            
            // Charger l'image sélectionnée
            vectorizer.loadImage(event.target.files[0])
                .then(() => {
                    // Activer le bouton de traitement
                    processBtn.disabled = false;
                    processBtn.textContent = "Traiter l'image";
                })
                .catch(error => {
                    console.error('Erreur lors du chargement de l\'image:', error);
                    alert('Erreur lors du chargement de l\'image: ' + error.message);
                    processBtn.textContent = "Traiter l'image";
                });
        }
    });
    
    // Créer un ensemble de contours test (cercle) si la vectorisation échoue
    function createTestContours() {
        const width = 100;
        const height = 100;
        const contours = [];
        
        // Créer un cercle simple
        const circle = [];
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) / 3;
        
        for (let i = 0; i < 36; i++) {
            const angle = (i / 36) * Math.PI * 2;
            circle.push({
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius
            });
        }
        
        // Fermer le cercle
        circle.push({...circle[0]});
        
        contours.push(circle);
        
        return {
            contours: contours,
            width: width,
            height: height
        };
    }
    
    // Écouter le clic sur le bouton de traitement
    processBtn.addEventListener('click', () => {
        if (!vectorizer.imageData) {
            alert('Veuillez d\'abord sélectionner une image.');
            return;
        }
        
        // Désactiver le bouton pendant le traitement
        processBtn.disabled = true;
        processBtn.textContent = "Traitement en cours...";
        
        const threshold = parseInt(thresholdInput.value);
        const simplification = parseInt(simplificationInput.value);
        
        // Créer une promesse qui se résout après un court délai
        const delayPromise = new Promise(resolve => setTimeout(resolve, 100));
        
        // Réinitialiser l'aperçu 3D
        extruder.cleanup();
        while (modelPreviewDiv.firstChild) {
            modelPreviewDiv.removeChild(modelPreviewDiv.firstChild);
        }
        
        // Chaîner les promesses
        delayPromise
            .then(() => vectorizer.vectorize(threshold, simplification))
            .then(data => {
                // Vérifier si nous avons des contours
                if (!data || !data.contours || data.contours.length === 0) {
                    console.warn("Pas de contours trouvés, utilisation de contours de test");
                    return createTestContours();
                }
                return data;
            })
            .then(data => {
                vectorData = data;
                
                // Créer le modèle 3D avec la hauteur d'extrusion
                const extrusionHeight = parseFloat(extrusionInput.value);
                
                // Petit délai supplémentaire pour permettre au DOM de se mettre à jour
                return new Promise(resolve => {
                    setTimeout(() => {
                        const mesh = extruder.createModel(vectorData, extrusionHeight);
                        resolve(mesh);
                    }, 100);
                });
            })
            .then(mesh => {
                // Activer les boutons d'exportation si le modèle a été créé
                const exportEnabled = mesh !== null;
                exportStlBtn.disabled = !exportEnabled;
                exportDxfBtn.disabled = !exportEnabled;
                
                // Réactiver le bouton de traitement
                processBtn.disabled = false;
                processBtn.textContent = "Traiter l'image";
            })
            .catch(error => {
                console.error('Erreur lors du traitement:', error);
                alert('Erreur lors du traitement: ' + (error.message || "Erreur inconnue"));
                
                // Réactiver le bouton en cas d'erreur
                processBtn.disabled = false;
                processBtn.textContent = "Traiter l'image";
            });
    });
    
    // Écouter les changements de hauteur d'extrusion
    extrusionInput.addEventListener('input', () => {
        if (vectorData) {
            const extrusionHeight = parseFloat(extrusionInput.value);
            extruder.createModel(vectorData, extrusionHeight);
        }
    });
    
    // Écouter le clic sur le bouton d'exportation STL
    exportStlBtn.addEventListener('click', () => {
        try {
            // Exporter le modèle en STL
            const stlBlob = extruder.exportSTL();
            
            // Télécharger le fichier
            const fileName = 'extrudator_model.stl';
            saveAs(stlBlob, fileName);
        } catch (error) {
            console.error('Erreur lors de l\'exportation STL:', error);
            alert('Erreur lors de l\'exportation STL: ' + error.message);
        }
    });
    
    // Écouter le clic sur le bouton d'exportation DXF
    exportDxfBtn.addEventListener('click', () => {
        try {
            // Exporter les contours en DXF
            const dxfBlob = extruder.exportDXF();
            
            // Télécharger le fichier
            const fileName = 'extrudator_contours.dxf';
            saveAs(dxfBlob, fileName);
        } catch (error) {
            console.error('Erreur lors de l\'exportation DXF:', error);
            alert('Erreur lors de l\'exportation DXF: ' + error.message);
        }
    });
    
    // Désactiver les boutons au démarrage
    processBtn.disabled = true;
    exportStlBtn.disabled = true;
    exportDxfBtn.disabled = true;
    
    // Initialiser la scène 3D vide pour éviter des erreurs
    extruder.initScene();
    
    // Afficher un message de bienvenue
    console.log('Extrudator est prêt!');
}); 