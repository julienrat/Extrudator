/**
 * Extrudator - Application principale
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialiser les variables globales
    const vectorizer = new Vectorizer();
    const extruder = new Extruder();
    let vectorData = null;
    let webcamStream = null; // Flux de la webcam
    
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
    
    // Éléments des options avancées
    const turdsizeInput = document.getElementById('turdsize');
    const turdsizeValue = document.getElementById('turdsize-value');
    const alphamaxInput = document.getElementById('alphamax');
    const alphamaxValue = document.getElementById('alphamax-value');
    const blurradiusInput = document.getElementById('blurradius');
    const blurradiusValue = document.getElementById('blurradius-value');
    const opttoleranceInput = document.getElementById('opttolerance');
    const opttoleranceValue = document.getElementById('opttolerance-value');
    const strokewidthInput = document.getElementById('strokewidth');
    const strokewidthValue = document.getElementById('strokewidth-value');
    const rightangleenhanceInput = document.getElementById('rightangleenhance');
    
    // Éléments de la webcam
    const webcamBtn = document.getElementById('webcam-btn');
    const webcamContainer = document.getElementById('webcam-container');
    const webcamVideo = document.getElementById('webcam-video');
    const captureBtn = document.getElementById('capture-btn');
    const cancelWebcamBtn = document.getElementById('cancel-webcam-btn');
    const webcamCanvas = document.getElementById('webcam-canvas');
    
    // Fonction pour démarrer la webcam
    function startWebcam() {
        // Vérifier si navigator.mediaDevices est disponible
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Votre navigateur ne supporte pas l'accès à la webcam");
            return;
        }
        
        // Cacher l'option d'upload de fichier et afficher la webcam
        webcamContainer.style.display = 'block';
        
        // Contraintes pour la webcam (HD si possible)
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment' // Caméra arrière sur mobile
            }
        };
        
        // Obtenir l'accès à la webcam
        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                webcamStream = stream;
                webcamVideo.srcObject = stream;
                return webcamVideo.play();
            })
            .catch(error => {
                console.error("Erreur lors de l'accès à la webcam:", error);
                alert("Impossible d'accéder à la webcam: " + error.message);
                stopWebcam();
            });
    }
    
    // Fonction pour arrêter la webcam
    function stopWebcam() {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
        }
        webcamVideo.srcObject = null;
        webcamContainer.style.display = 'none';
    }
    
    // Capturer une image depuis la webcam
    function captureImage() {
        if (!webcamStream) return;
        
        // Configurer le canvas pour la capture
        const video = webcamVideo;
        const canvas = webcamCanvas;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Dessiner l'image capturée sur le canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Créer une image à partir du canvas
        canvas.toBlob(blob => {
            // Créer un objet File à partir du Blob
            const capturedFile = new File([blob], "webcam-capture.png", { type: "image/png" });
            
            // Charger l'image capturée dans le vectorizer
            vectorizer.loadImage(capturedFile)
                .then(() => {
                    // Activer le bouton de traitement
                    processBtn.disabled = false;
                    processBtn.textContent = "Traiter l'image";
                    
                    // Arrêter la webcam et cacher l'interface
                    stopWebcam();
                })
                .catch(error => {
                    console.error("Erreur lors du chargement de l'image capturée:", error);
                    alert("Erreur lors du chargement de l'image: " + error.message);
                });
        }, "image/png");
    }
    
    // Mettre à jour les valeurs affichées des sliders
    function updateSliderValues() {
        thresholdValue.textContent = thresholdInput.value;
        simplificationValue.textContent = simplificationInput.value;
        turdsizeValue.textContent = turdsizeInput.value;
        alphamaxValue.textContent = alphamaxInput.value;
        blurradiusValue.textContent = blurradiusInput.value;
        opttoleranceValue.textContent = opttoleranceInput.value;
        strokewidthValue.textContent = strokewidthInput.value;
    }
    
    // Obtenir les options avancées à partir des inputs
    function getAdvancedOptions() {
        return {
            turdsize: parseInt(turdsizeInput.value),
            alphamax: parseFloat(alphamaxInput.value),
            blurradius: parseFloat(blurradiusInput.value),
            opttolerance: parseFloat(opttoleranceInput.value),
            strokewidth: parseFloat(strokewidthInput.value),
            rightangleenhance: rightangleenhanceInput.checked
        };
    }
    
    // Écouter les clics sur les boutons liés à la webcam
    webcamBtn.addEventListener('click', startWebcam);
    captureBtn.addEventListener('click', captureImage);
    cancelWebcamBtn.addEventListener('click', stopWebcam);
    
    // Écouter les changements de valeur des sliders
    thresholdInput.addEventListener('input', updateSliderValues);
    simplificationInput.addEventListener('input', updateSliderValues);
    turdsizeInput.addEventListener('input', updateSliderValues);
    alphamaxInput.addEventListener('input', updateSliderValues);
    blurradiusInput.addEventListener('input', updateSliderValues);
    opttoleranceInput.addEventListener('input', updateSliderValues);
    strokewidthInput.addEventListener('input', updateSliderValues);
    
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
        const advancedOptions = getAdvancedOptions();
        
        // Créer une promesse qui se résout après un court délai
        const delayPromise = new Promise(resolve => setTimeout(resolve, 100));
        
        // Réinitialiser l'aperçu 3D
        extruder.cleanup();
        while (modelPreviewDiv.firstChild) {
            modelPreviewDiv.removeChild(modelPreviewDiv.firstChild);
        }
        
        // Chaîner les promesses
        delayPromise
            .then(() => vectorizer.vectorize(threshold, simplification, advancedOptions))
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
    
    // Initialiser les valeurs affichées
    updateSliderValues();
    
    // Afficher un message de bienvenue
    console.log('Extrudator est prêt!');
}); 