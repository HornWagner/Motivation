/**
 * Settings, UI constants
 */

const Settings = {
    showLinesBetweenDataPoints: true,
    scaleLineSmoothing: 0.0
}

const Constants = {
    get CATEGORY_UI_SIZE() { return remToPx(9); },
    get HANDLE_RADIUS_NORMAL() { return remToPx(0.8); },
    get HANDLE_RADIUS_HOVERED() { return remToPx(1.0); },
    get LINE_SIZE_CURRENT_PROFILE() { return remToPx(0.6); },
    get LINE_SIZE_OTHER_PROFILE() { return remToPx(0.4); },
    get HANDLE_RADIUS_OTHER_PROFILE() { return remToPx(0.5); },
    get LINE_SIZE_SCALE() { return remToPx(0.15); },
    get LINE_SIZE_MAIN_SCALE() { return remToPx(0.3); },
    get LINE_SIZE_CORNER() { return remToPx(0.4); },
    get CORNER_INDICATOR_RADIUS() { return remToPx(0.5); },
    get CATEGORY_UI_LINE_SIZE() { return remToPx(0.3); }
}

/**
 * Global Variables
 */

const appContainer = document.getElementById("appContainer");
const appCanvas = document.getElementById("appCanvas");
const tutorialButton = document.getElementById("tutorialButton");
const loadButton = document.getElementById("loadButton");
const saveButton = document.getElementById("saveButton");
const imageButton = document.getElementById("imageButton");
const addButton = document.getElementById("addButton");
const resizeObserver = new ResizeObserver(onResize);
let activeButton = null;
let categoryButtons = [];
let categoryAngles = [];
let profileUIElements = [];
let isMainLoopRunning = false;
let tutorial = null;

/**
 * Variables loaded from data
 */

let categoryCount = 0;
let scaleSize = 0;
let isDualScale = false;

/**
 * Variables for input handling
 */

let offsetX, offsetY;
let draggedHandle = null;
let dataHandles = [];
let hoveredHandle = null;

/**
 * Session variables, savable and loadable
 */

let profiles = [];
let currentProfileID = 0;

/**
*   Setup
*/

fetch('./data.json')
    .then(result => result.json())
    .then(data => {
        if (data.categories == null || !Array.isArray(data.categories) || data.categories.length === 0 || data.scaleSize == null || typeof data.scaleSize !== "number" || data.isDualScale == null || typeof data.isDualScale !== "boolean") {
            console.error("Invalid categories data");
            return;
        }

        categoryCount = data.categories.length;
        scaleSize = data.scaleSize;
        isDualScale = data.isDualScale;

        for (let i = 0; i < categoryCount; i++) {
            let category = data.categories[i];

            if (category == null) {
                console.error(`Invalid category at index ${i}`);
                continue;
            }

            if (category.color == null) {
                console.error(`Invalid color for category at index ${i}`);
                continue;
            }

            if (category.options == null || !Array.isArray(category.options)) {
                console.error(`Invalid options for category at index ${i}`);
                continue;
            }

            if (category.options.length != 3) {
                console.error(`Invalid options length for category at index ${i}`);
                continue;
            }

            if (category.options[0].name == null || category.options[1].name == null || category.options[2].name == null) {
                console.error(`Invalid option name for category at index ${i}`);
                continue;
            }

            if (category.options[0].description == null || category.options[1].description == null || category.options[2].description == null) {
                console.error(`Invalid option description for category at index ${i}`);
                continue;
            }

            let angle = getCategoryAngle(i, categoryCount);
            let radius = getGraphRadius(appCanvas) + Constants.CATEGORY_UI_SIZE * 1.1;
            let x = appCanvas.width / 2 + Math.cos(angle) * radius;
            let y = appCanvas.height / 2 + Math.sin(angle) * radius;

            let button = createCategoryUI(x, y, Constants.CATEGORY_UI_SIZE, radToDeg(angle) + 180, category.color, [
                { title: category.options[0].name, description: category.options[0].description },
                { title: category.options[1].name, description: category.options[1].description },
                { title: category.options[2].name, description: category.options[2].description }
            ], category.name);

            categoryButtons.push(button);
        }

        dataHandles = [];

        for (let i = 0; i < categoryCount; i++) {
            dataHandles.push({
                index: i
            });
        }

        for (let i = 0; i < categoryCount; i++)
            categoryAngles.push(getCategoryAngle(i, categoryCount));

        const sessionData = sessionStorage.getItem("projectData");
        if (sessionData)
            loadProject(JSON.parse(sessionData));

        draw();
    })
    .catch(error => console.error('Error loading JSON:', error));

resizeObserver.observe(appContainer);

appCanvas.addEventListener("mousedown", e => {
    onInputDown(e.clientX, e.clientY, 0);
});

appCanvas.addEventListener("mousemove", e => {
    onInputMove(e.clientX, e.clientY, 0);
});

appCanvas.addEventListener("mouseup", () => {
    onInputUp();
});

window.addEventListener("beforeunload", () => {
    const data = saveProject();
    sessionStorage.setItem("projectData", JSON.stringify(data));
});

//TODO: Add touch support
/**
canvas.addEventListener("touchstart", e => {
    onInputDown(e.clientX, e.clientY, 3);
});

canvas.addEventListener("touchmove", e => {
    onInputMove(e.clientX, e.clientY, 3);
});

canvas.addEventListener("touchend", () => {
    onInputUp();
});
*/

if (tutorialButton) tutorialButton.addEventListener("click", () => {
    startTutorial();
});

if (loadButton) loadButton.addEventListener("click", () => {
    loadProjectFromFile();
});

if (saveButton) saveButton.addEventListener("click", () => {
    saveProjectToFile();
});

if (imageButton) imageButton.addEventListener("click", async () => {
    await saveAsImage();
});

if (addButton) addButton.addEventListener("click", () => {
    const profileID = generateProfileID();
    const profile = createProfile(profileID);
    createProfileUI(profile);
    draw();
});

/**
 *  Profile Management
 */

class Profile {
    constructor(id) {
        this.id = id;
        this.dataPoints = [];
        this.isVisible = true;
    }

    get color() {
        return getProfileColor(this.id);
    }
}

function createProfile(id) {
    const profile = new Profile(id);
    profiles[id] = profile;

    for (let i = 0; i < categoryCount; i++) {
        profile.dataPoints[i] = 0.5;
    }

    return profile;
}

function removeProfile(id) {
    const profilesIndex = profiles.findIndex(p => p != null && p.id === id);

    if (profilesIndex > -1)
        profiles.splice(profilesIndex, 1);

    const profileUIIndex = profileUIElements.findIndex(p => p != null && p.id === id);

    if (profileUIIndex > -1)
        profileUIElements.splice(profileUIIndex, 1);
}

function setActiveProfileButton(id) {
    const container = document.getElementById("profileButtons");

    let button = null;
    for (let i = 0; i < container.children.length; i++) {
        const child = container.children[i];
        const childButton = child.getElementsByClassName("profile-ui")[0];

        if (childButton != null && child.dataset.profileId == id) {
            button = childButton;
            break;
        }
    }

    if (!button)
        return;

    if (activeButton && activeButton !== button) {
        activeButton.classList.remove("active");
        activeButton.classList.remove("expanded");
    }

    activeButton = button;
    button.classList.add("active");
    button.classList.add("expanded");

    currentProfileID = id;
}

function clearProfiles() {
    const container = document.getElementById("profileButtons");

    profiles = [];
    currentProfileID = 0;
    activeButton = null;
    currentGenerateProfileID = 0;
    while (container.firstChild)
        container.removeChild(container.firstChild);
}

/**
 *  Input/Resize
 */

function onResize() {
    appCanvas.width = appContainer.clientWidth;
    appCanvas.height = appContainer.clientHeight;

    for (let i = 0; i < categoryCount; i++) {
        let angle = getCategoryAngle(i, categoryCount);
        let radius = getGraphRadius(appCanvas) + Constants.CATEGORY_UI_SIZE * 1.1;
        let x = appCanvas.width / 2 + Math.cos(angle) * radius;
        let y = appCanvas.height / 2 + Math.sin(angle) * radius;

        categoryButtons[i].setPosition(x, y, radToDeg(angle) + 180);
    }

    if (tutorial != null)
        tutorial.resize();

    draw();
}

function onInputDown(x, y, size) {
    let currentProfile = profiles[currentProfileID];

    if (currentProfile == null)
        return;

    const rect = appCanvas.getBoundingClientRect();
    const inputX = x - rect.left;
    const inputY = y - rect.top;
    const graphRadius = getGraphRadius(appCanvas);

    for (let i = 0; i < categoryCount; i++) {
        const handle = dataHandles[i];
        const dataPoint = currentProfile.dataPoints[handle.index];
        const angle = categoryAngles[handle.index];

        const handleX = appCanvas.width / 2 + graphRadius * dataPoint * Math.cos(angle);
        const handleY = appCanvas.height / 2 + graphRadius * dataPoint * Math.sin(angle);

        const dx = inputX - handleX;
        const dy = inputY - handleY;

        const handleRadius = (hoveredHandle == handle) ? Constants.HANDLE_RADIUS_HOVERED : Constants.HANDLE_RADIUS_NORMAL;

        if (dx * dx + dy * dy <= handleRadius * handleRadius + size * size) {
            draggedHandle = handle;
            offsetX = dx;
            offsetY = dy;
            break;
        }
    }
}

function onInputMove(x, y, size) {
    const currentProfile = profiles[currentProfileID];

    if (currentProfile == null)
        return;

    const rect = appCanvas.getBoundingClientRect();
    const graphRadius = getGraphRadius(appCanvas);

    if (!draggedHandle) {
        const inputX = x - rect.left;
        const inputY = y - rect.top;

        let newHoveredHandle = null;

        for (let i = 0; i < categoryCount; i++) {
            const handle = dataHandles[i];
            const dataPoint = currentProfile.dataPoints[handle.index];
            const angle = categoryAngles[handle.index];

            const handleX = appCanvas.width / 2 + graphRadius * dataPoint * Math.cos(angle);
            const handleY = appCanvas.height / 2 + graphRadius * dataPoint * Math.sin(angle);

            const dx = inputX - handleX;
            const dy = inputY - handleY;

            const handleRadius = (hoveredHandle == handle) ? Constants.HANDLE_RADIUS_HOVERED : Constants.HANDLE_RADIUS_NORMAL;

            if (dx * dx + dy * dy <= handleRadius * handleRadius + size * size) {
                newHoveredHandle = handle;
                break;
            }
        }

        if ((newHoveredHandle != null && hoveredHandle == null) || (newHoveredHandle == null && hoveredHandle != null)) {
            hoveredHandle = newHoveredHandle;
            draw();
        }

        return;
    }

    const angle = categoryAngles[draggedHandle.index];
    const inputX = x - rect.left - offsetX;
    const inputY = y - rect.top - offsetY;

    const lineStart = {
        x: appCanvas.width / 2,
        y: appCanvas.height / 2
    }

    const lineEnd = {
        x: lineStart.x + graphRadius * Math.cos(angle),
        y: lineStart.y + graphRadius * Math.sin(angle)
    }

    const APx = inputX - lineStart.x;
    const APy = inputY - lineStart.y;
    const ABx = lineEnd.x - lineStart.x;
    const ABy = lineEnd.y - lineStart.y;
    const ab2 = ABx * ABx + ABy * ABy;
    let t = (APx * ABx + APy * ABy) / ab2;
    t = Math.max(0, Math.min(1, t));

    currentProfile.dataPoints[draggedHandle.index] = t;

    draw();
}

function onInputUp() {
    draggedHandle = null;
}

/**
 * Tutorial
 */

function startTutorial() {
    const steps = [];

    steps.push({
        element: tutorialButton,
        text: "Starte das Tutorial, um mehr über die Funktionen der Anwendung zu erfahren."
    });

    steps.push({
        element: loadButton,
        text: "Lade ein zuvor gespeichertes Projekt, um deine Daten wiederherzustellen."
    });

    steps.push({
        element: saveButton,
        text: "Speichere dein aktuelles Projekt, um deine Daten zu sichern und später wieder zu laden."
    });

    steps.push({
        element: imageButton,
        text: "Speichere das aktuelle Diagramm als übersichtliche Bilddatei."
    });

    steps.push({
        element: addButton,
        text: "Erstelle ein neues Profil, um einen weiteren Datensatz hinzuzufügen."
    });

    steps.push({
        element: categoryButtons[0].container,
        text: "Ziehe die Maus über die Kategorien, um weitere Informationen über sie zu erhalten.",
        widthScaling: 1.5,
        heightScaling: 1.3
    });

    steps.push({
        element: categoryButtons[0].container,
        text: "Klicke auf eine Kategorie, um die Auswahl zu ändern.",
        widthScaling: 1.5,
        heightScaling: 1.3
    });

    if (profiles.length > 0) {
        let profileButton = document.querySelector(`.profile-ui-wrapper[data-profile-id="${currentProfileID}"]`);
        if (!profileButton)
            profileButton = document.querySelector(`.profile-ui-wrapper[data-profile-id="${profiles[0].id}"]`);

        if (profileButton != null) {
            steps.push({
                element: profileButton,
                text: "Dies ist das aktuell ausgewählte Profil. Klicke auf ein anderes Profil, um es zu bearbeiten."
            });

            steps.push({
                element: profileButton.querySelector(".color-box"),
                text: "Die Farbe dieses Kastens entspricht der Farbe des Profils im Diagramm."
            });

            steps.push({
                element: profileButton.querySelector(".text-field"),
                text: "Hier kannst du dem Profil einen Namen geben."
            });

            steps.push({
                element: profileButton.querySelector(".icons"),
                text: "Verwende diese Symbole, um die Sichtbarkeit des Profils umzuschalten oder es zu löschen."
            });

            steps.push({
                element: appCanvas,
                text: "Ziehe die Punkte im Diagramm, um die Daten des aktuellen Profils anzupassen.",
                widthScaling: 0.6 * (appCanvas.height / appCanvas.width),
                heightScaling: 0.6
            });
        }
    }

    if (steps.length === 0)
        return;

    if (tutorial == null)
        tutorial = new TutorialUI();

    tutorial.startTutorial(steps);
}

/**
*   Drawing
*/

function draw(canvas = appCanvas) {
    const ctx = canvas.getContext("2d");
    const hoveredIndex = draggedHandle ? draggedHandle.index : hoveredHandle ? hoveredHandle.index : -1;
    const radius = getGraphRadius(canvas);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    function drawBackground(radius, scaleStep) {
        const backgroundColor = '#6b6b6bff';

        function drawScaleLevel(radius, isMain) {
            function getSamplesPerEdge(n, t) {
                const base = 8;
                const extra = Math.round(24 * t);
                return Math.max(3, base + extra + Math.round(n / 3));
            }

            function getCirclePoint(angle) {
                return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
            }

            function lerpPoint(pointA, pointB, t) {
                const lerp = (a, b) => a + (b - a) * t;
                return { x: lerp(pointA.x, pointB.x), y: lerp(pointA.y, pointB.y) };
            }

            const vertices = [];

            for (let i = 0; i < categoryCount; i++) {
                const angle = categoryAngles[i];
                vertices.push({ angle, point: getCirclePoint(angle) });
            }

            const circleAmountClamped = Math.max(0, Math.min(1, Settings.scaleLineSmoothing));
            const samplesPerEdge = getSamplesPerEdge(categoryCount, circleAmountClamped);
            const firstArcPoint = lerpPoint(vertices[0].point, vertices[0].point, 0);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(firstArcPoint.x, firstArcPoint.y);

            for (let i = 0; i < categoryCount; i++) {
                const vertexA = vertices[i];
                const vertexB = vertices[(i + 1) % categoryCount];

                const angleA = vertexA.angle;
                let angleB = vertexB.angle;

                if (angleB <= angleA)
                    angleB += Math.PI * 2;

                for (let j = 1; j <= samplesPerEdge; j++) {
                    const s = j / samplesPerEdge;

                    const chord = lerpPoint(vertexA.point, vertexB.point, s);
                    const arcAngle = angleA + (angleB - angleA) * s;
                    const arc = getCirclePoint(arcAngle);
                    const point = lerpPoint(chord, arc, circleAmountClamped);

                    ctx.lineTo(point.x, point.y);
                }
            }

            ctx.closePath();

            if (isMain) {
                ctx.lineWidth = Constants.LINE_SIZE_MAIN_SCALE;
                ctx.strokeStyle = backgroundColor;
                ctx.lineCap = "round";
            } else {
                ctx.lineWidth = Constants.LINE_SIZE_SCALE;
                ctx.strokeStyle = backgroundColor;
                ctx.lineCap = "round";
            }

            ctx.stroke();
            ctx.restore();
        }

        const radii = [];
        //TODO: Dual Scale
        for (let i = 0; i <= scaleSize - 1; i++) {
            const scaleRadius = radius * (scaleSize - i) / scaleSize;
            radii.push(scaleRadius);
        }

        for (let i = 0; i < radii.length; i++) {
            const scaleRadius = radii[i];
            const isMain = (i % scaleStep) == 0;

            drawScaleLevel(scaleRadius, isMain);
        }

        ctx.save();
        ctx.lineWidth = Constants.LINE_SIZE_CORNER;
        ctx.strokeStyle = backgroundColor;
        ctx.fillStyle = backgroundColor;
        ctx.lineCap = "round";

        for (let i = 0; i < categoryAngles.length; i++) {
            const angle = categoryAngles[i];

            const x1 = canvas.width / 2;
            const y1 = canvas.height / 2;
            const x2 = x1 + Math.cos(angle) * radius;
            const y2 = y1 + Math.sin(angle) * radius;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(x2, y2, Constants.CORNER_INDICATOR_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
        }

        ctx.restore();
    }

    function drawData(anglesAndRadii, color, isCurrentProfile, isHiddenCurrentProfile) {
        const points = anglesAndRadii.map(angleAndRadius => ({
            x: centerX + angleAndRadius.radius * Math.cos(angleAndRadius.angle),
            y: centerY + angleAndRadius.radius * Math.sin(angleAndRadius.angle)
        }));

        const BORDER_SIZE = 1;
        const BORDER_COLOR = "black";

        function drawLines(isCurrentProfile, isBorder) {
            const baseLineSize = isCurrentProfile ? Constants.LINE_SIZE_CURRENT_PROFILE : Constants.LINE_SIZE_OTHER_PROFILE;
            ctx.strokeStyle = isBorder ? BORDER_COLOR : color;
            ctx.lineWidth = isBorder ? baseLineSize : baseLineSize - BORDER_SIZE * 2;
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
            ctx.stroke();
        }

        function drawPoints(isCurrentProfile, isBorder) {
            for (let i = 0; i < points.length; i++) {
                const point = points[i];

                let pointRadius = isCurrentProfile ? Constants.HANDLE_RADIUS_NORMAL : Constants.HANDLE_RADIUS_OTHER_PROFILE;

                if (i == hoveredIndex && isCurrentProfile)
                    pointRadius = Constants.HANDLE_RADIUS_HOVERED;

                ctx.fillStyle = isBorder ? BORDER_COLOR : color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, isBorder ? pointRadius : pointRadius - BORDER_SIZE, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        ctx.save();

        if (isHiddenCurrentProfile)
            ctx.globalAlpha = 0.6;

        if (Settings.showLinesBetweenDataPoints)
            drawLines(isCurrentProfile, true);

        drawPoints(isCurrentProfile, true);

        if (Settings.showLinesBetweenDataPoints)
            drawLines(isCurrentProfile, false);

        drawPoints(isCurrentProfile, false);

        ctx.restore();
    }

    function drawProfile(profile, isCurrentProfile, isHiddenCurrentProfile = false) {
        const dataAnglesAndRadii = [];
        for (let i = 0; i < categoryCount; i++) {
            const dataPoint = profile.dataPoints[i];
            const dataPointAngle = categoryAngles[i];
            const dataPointRadius = radius * dataPoint;

            dataAnglesAndRadii.push({
                angle: dataPointAngle,
                radius: dataPointRadius
            });
        }

        drawData(dataAnglesAndRadii, profile.color, isCurrentProfile, isHiddenCurrentProfile);
    }

    drawBackground(radius, 1000);

    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];
        if (profile == null)
            continue;

        if (!profile.isVisible)
            continue;

        const isCurrentProfile = (profile.id === currentProfileID);

        if (!isCurrentProfile)
            drawProfile(profile, false);
    }

    let currentProfile = profiles[currentProfileID];
    if (currentProfile != null)
        drawProfile(currentProfile, true, currentProfile.isVisible === false);
}

/**
 * Save project (JSON)
 */

function saveProjectToFile() {
    const data = JSON.stringify(saveProject());

    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");

    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "motivation.json";
    link.click();
    URL.revokeObjectURL(url);
}

function saveProject() {
    const data = {
        profiles: profiles,
        currentProfileID: currentProfileID,
        activeCategoryCorners: categoryButtons.map(ui => ui.getActiveCornerIndex())
    };
    return data;
}

/**
 * Load project (JSON)
 */

function loadProjectFromFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file)
            return;

        clearProfiles();

        const reader = new FileReader();

        reader.onload = function (evt) {
            const data = JSON.parse(evt.target.result);
            loadProject(data);
        };
        reader.readAsText(file);
    };
    input.click();
}

function loadProject(data) {
    if (data.profiles == null || !Array.isArray(data.profiles)) {
        console.error("Invalid profiles data");

        window.alert("Fehler beim Laden der Datei: Ungültige Profildaten.");
        return;
    }

    if (data.currentProfileID == null || typeof data.currentProfileID !== "number") {
        console.error("Invalid currentProfileID");
        window.alert("Fehler beim Laden der Datei: Ungültige aktuelle Profil-ID.");
        return;
    }

    if (data.activeCategoryCorners == null || !Array.isArray(data.activeCategoryCorners)) {
        console.error("Invalid activeCategoryCorners data");
        window.alert("Fehler beim Laden der Datei: Ungültige aktive Kategorien-Ecken.");
        return;
    }

    profiles = [];

    for (let i = 0; i < data.profiles.length; i++) {
        const profileData = data.profiles[i];

        if (profileData == null || profileData.id == null || typeof profileData.id !== "number") {
            console.error(`Invalid profile data at index ${i}: ${JSON.stringify(profileData)}`);
            window.alert(`Fehler beim Laden der Datei: Ungültige Profildaten bei Profil ${i}.`);
            profiles[i] = null;
            continue;
        }

        const profile = new Profile(profileData.id);
        profile.isVisible = profileData.isVisible === true;
        profile.dataPoints = Array.isArray(profileData.dataPoints) ? profileData.dataPoints : [];
        profile.name = profileData.name;

        profiles[profile.id] = profile;

        createProfileUI(profile);
    }

    for (let i = 0; i < categoryButtons.length; i++) {
        const cornerIndex = data.activeCategoryCorners[i];
        if (cornerIndex == null || typeof cornerIndex !== "number" || cornerIndex < 0 || cornerIndex > 2) {
            console.error(`Invalid corner index for category button ${i}: ${cornerIndex}`);
            window.alert(`Fehler beim Laden der Datei: Ungültiger Eckenindex für Kategorie ${i}.`);
            continue;
        }
        categoryButtons[i].setActiveCornerIndex(cornerIndex);
    }

    setActiveProfileButton(data.currentProfileID);
    draw();
}

/**
 * Save as image
 */

async function saveAsImage() {
    const html2canvas = await loadHtml2Canvas();
    const swal = await loadSweetAlert2();

    function setPrintMode(isPrintMode) {
        for (const categoryButton of categoryButtons) {
            if (categoryButton == null)
                continue;

            categoryButton.setPrintMode(isPrintMode);
        }

        for (const profile of profiles) {
            if (profile == null)
                continue;

            const ui = profileUIElements[profile.id];

            if (!ui)
                continue;

            ui.setPrintMode(isPrintMode);
        }
    }

    setPrintMode(true);

    const canvas = await html2canvas(appContainer, {
        backgroundColor: '#ffffff',
        useCORS: true,
        scale: 2,
        ignoreElements: (element) => {
            return element.className === "topControls";
        }
    });

    setPrintMode(false);

    const dataUrl = canvas.toDataURL('image/png');
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
        const viewportWidth = window.innerWidth * 0.9;
        const viewportHeight = window.innerHeight * 0.8;

        let displayWidth = img.width;
        let displayHeight = img.height;

        const widthRatio = viewportWidth / displayWidth;
        const heightRatio = viewportHeight / displayHeight;
        const scale = Math.min(widthRatio, heightRatio, 1);

        displayWidth *= scale;
        displayHeight *= scale;

        swal.fire({
            title: 'Vorschaubild',
            html: `<img src="${dataUrl}" width="${displayWidth}" height="${displayHeight}" style="display:block; margin:auto; border-radius:10px; border:1px solid #ccc;" />`,
            showCancelButton: true,
            confirmButtonText: 'Speichern',
            cancelButtonText: 'Schließen',
            width: 'auto',
        }).then(async (result) => {
            if (result.isConfirmed) {
                const response = await fetch(dataUrl);
                const blob = await response.blob();

                if (window.showSaveFilePicker) {
                    try {
                        const handle = await window.showSaveFilePicker({
                            suggestedName: "image.png",
                            types: [{
                                description: 'PNG Bilddatei',
                                accept: { 'image/png': ['.png'] }
                            }]
                        });

                        const writable = await handle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    } catch (err) {
                        console.error('Save canceled or failed', err);
                    }
                } else {
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.download = suggestedName;
                    link.click();
                }
            }
        });
    };
}

/**
 * UI Creation Functions
 */

class ProfileUI {
    constructor(parent, profile) {
        this.parent = parent;
        this.profile = profile;

        this.wrapper = document.createElement("div");
        this.wrapper.className = "profile-ui-wrapper";
        this.wrapper.dataset.profileId = profile.id;
        parent.appendChild(this.wrapper);

        const buttonElement = document.createElement("div");
        buttonElement.className = "profile-ui";
        buttonElement.dataset.id = profile.id;

        const colorBox = document.createElement("div");
        colorBox.className = "color-box";
        colorBox.style.background = profile.color;

        const textField = document.createElement("input");
        textField.type = "text";
        textField.className = "text-field";
        textField.placeholder = `Name eingeben...`;

        if (profile.name != null)
            textField.value = profile.name;

        const iconsContainer = document.createElement("div");
        iconsContainer.className = "icons";

        const iconButtons = {};

        const iconStates = {
            visible: {
                alwaysVisible: true,
                booleanState: profile.isVisible,
                setTrue: {
                    normal: "resources/visible_icon.png",
                    hover: "resources/visible_icon.png",
                    active: "resources/visible_icon.png",
                    callback: (_button, state) => {
                        profile.isVisible = state;
                        draw();
                    }
                },
                setFalse: {
                    normal: "resources/invisible_icon.png",
                    hover: "resources/invisible_icon.png",
                    active: "resources/invisible_icon.png",
                    callback: (_button, state) => {
                        profile.isVisible = state;
                        draw();
                    }
                }
            },
            delete: {
                alwaysVisible: false,
                normal: "resources/delete_icon.png",
                hover: "resources/delete_hovered_icon.png",
                active: "resources/delete_pressed_icon.png",
                callback: async button => {
                    const swal = await loadSweetAlert2();
                    const result = await swal.fire({
                        title: "Profil löschen?",
                        text: "Das Löschen kann nicht rückgängig gemacht werden!",
                        icon: "warning",
                        showConfirmButton: true,
                        showCancelButton: true,
                        confirmButtonText: "Löschen",
                        cancelButtonText: "Abbrechen",
                        theme: "material-ui",
                        allowOutsideClick: false
                    });

                    if (result.isConfirmed) {
                        await swal.fire({
                            title: "Profil gelöscht!",
                            icon: "success",
                            timer: 1200,
                            showConfirmButton: false
                        });

                        if (activeButton === button)
                            activeButton = null;

                        parent.removeChild(button.parentElement);
                        removeProfile(profile.id);
                        draw();
                    }
                }
            }
        }

        Object.entries(iconStates).forEach(([name, states]) => {
            const iconButton = document.createElement("button");
            const image = document.createElement("img");
            iconButton._image = image;
            iconButton._states = states;

            if (typeof states.booleanState !== "undefined")
                iconButton._currentSet = states.booleanState ? states.setTrue : states.setFalse;
            else
                iconButton._currentSet = states;

            image.src = iconButton._currentSet.normal;
            iconButton.appendChild(image);
            iconsContainer.appendChild(iconButton);

            if (states.alwaysVisible)
                iconButton.classList.add("always-visible");

            iconButtons[name] = iconButton;

            iconButton.addEventListener("mouseover", () => image.src = iconButton._currentSet.hover || iconButton._currentSet.normal);
            iconButton.addEventListener("mouseout", () => image.src = iconButton._currentSet.normal);

            iconButton.addEventListener("click", e => {
                e.stopPropagation();

                if (typeof states.booleanState !== "undefined") {
                    states.booleanState = !states.booleanState;
                    iconButton._currentSet = states.booleanState ? states.setTrue : states.setFalse;
                    image.src = iconButton._currentSet.normal;
                }

                if (iconButton._currentSet.active)
                    image.src = iconButton._currentSet.active;

                if (iconButton._currentSet.callback)
                    iconButton._currentSet.callback(buttonElement, states.booleanState);
            });
        });

        buttonElement.appendChild(colorBox);
        buttonElement.appendChild(textField);
        buttonElement.appendChild(iconsContainer);
        this.wrapper.appendChild(buttonElement);

        buttonElement.addEventListener("mouseenter", () => { if (!buttonElement.classList.contains("active")) buttonElement.classList.add("expanded"); });
        buttonElement.addEventListener("mouseleave", () => { if (!buttonElement.classList.contains("active")) buttonElement.classList.remove("expanded"); });
        buttonElement.addEventListener("click", e => {
            if (e.target !== textField) {
                setActiveProfileButton(profile.id);
                draw();
            }
        });

        buttonElement.setBooleanIcon = (iconName, boolValue) => {
            const iconButton = iconButtons[iconName];
            if (!iconButton)
                return;

            const states = iconButton._states;
            if (typeof states.booleanState !== "undefined") {
                states.booleanState = boolValue;
                iconButton._currentSet = boolValue ? states.setTrue : states.setFalse;
                iconButton._image.src = iconButton._currentSet.normal;
            }
        };

        const printElement = document.createElement("div");
        printElement.className = "profile-ui-print-element";

        const printColorBox = document.createElement("div");
        printColorBox.className = "color-box";
        printColorBox.style.background = profile.color;

        const printTextField = document.createElement("div");
        printTextField.className = "text-field";
        printTextField.textContent = textField.value || "Kein Name";

        printElement.appendChild(printColorBox);
        printElement.appendChild(printTextField);
        this.wrapper.appendChild(printElement);

        textField.addEventListener("input", () => {
            printTextField.textContent = textField.value || "Kein Name";
            profile.name = textField.value;
        });
    }

    setPrintMode(isPrintMode) {
        if (isPrintMode)
            this.wrapper.classList.add("print-mode");
        else
            this.wrapper.classList.remove("print-mode");
    }
}

function createProfileUI(profile) {
    const container = document.getElementById("profileButtons");
    const ui = new ProfileUI(container, profile);

    if (container.children.length === 1)
        setActiveProfileButton(profile.id);

    profileUIElements[profile.id] = ui;

    return ui;
};

class CategoryUI {
    constructor(parent, size, position, targetRotation = 0, color = "#00d1ff", cornerLabels = [], centerLabelText = "") {
        this.parent = parent;
        this.size = size;
        this.targetRotation = targetRotation;
        this.rotation = 0;
        this.color = color;
        this.cornerLabels = cornerLabels;
        this.centerLabelText = centerLabelText;
        this.activeCorner = null;
        this.radius = size / Math.sqrt(3);
        this.baseCornerAngles = [0, 120, 240];
        this.animation = null;

        this.container = document.createElement("div");
        this.container.className = "category-ui-container";
        this.container.style.left = `${position.x}px`;
        this.container.style.top = `${position.y}px`;
        parent.appendChild(this.container);

        this.canvas = document.createElement("canvas");
        this.canvas.className = "category-ui-canvas";
        this.canvas.width = size;
        this.canvas.height = size;
        this.ctx = this.canvas.getContext("2d", { alpha: true });
        this.container.appendChild(this.canvas);

        this.centerLabelElement = document.createElement("div");
        this.centerLabelElement.className = "category-ui-center-label";
        this.centerLabelElement.textContent = centerLabelText;
        this.container.appendChild(this.centerLabelElement);

        this.printLabelElement = document.createElement("div");
        this.printLabelElement.className = "category-ui-print-label";
        this.printLabelElement.innerHTML = `<strong>${centerLabelText}</strong><br/>${cornerLabels[0].title.replace(': ', ':&nbsp;')}`;
        this.printLabelElement.style.background = shadeColor(this.color, -20);
        this.printLabelElement.style.borderColor = shadeColor(this.color, -40);
        this.container.appendChild(this.printLabelElement);

        this.labelElements = [];
        for (let i = 0; i < 3; i++) {
            const label = document.createElement("div");
            label.className = "category-ui-label";
            const labelData = cornerLabels[i] || { title: "Missing corner " + i, description: "" };
            label.innerHTML = `<div class="title">${labelData.title}</div><div class="description">${labelData.description}</div>`;
            const normal = shadeColor(this.color, -20);
            const hover = shadeColor(this.color, -10);
            label.style.background = normal;

            label.addEventListener("mouseenter", () => {
                label.classList.add("expanded");
                label.style.background = hover;
                label.parentElement.appendChild(label);
            });

            label.addEventListener("mouseleave", () => {
                label.classList.remove("expanded");
                label.style.background = normal;
            });

            label.onclick = e => {
                e.stopPropagation();
                this.activateCorner(i);
            };

            this.container.appendChild(label);
            this.labelElements.push(label);
        }

        this.activeCorner = this._cornerClosestToTargetDir();
        this.draw();
    }

    _cornerClosestToTargetDir() {
        let best = 0, bestDelta = Infinity;
        for (let i = 0; i < 3; i++) {
            const absAngle = mod360(this.targetRotation + this.rotation + this.baseCornerAngles[i]);
            const d = Math.abs(shortestAngleDelta(this.targetRotation, absAngle));
            if (d < bestDelta) {
                bestDelta = d;
                best = i;
            }
        }
        return best;
    }

    setPosition(x, y) {
        this.container.style.left = `${x}px`;
        this.container.style.top = `${y}px`;
    }

    activateCorner(i) {
        this.activeCorner = i;
        const desired = -this.baseCornerAngles[i];
        const delta = shortestAngleDelta(desired, this.rotation);
        const endRot = this.rotation + delta;
        this.animation = { start: this.rotation, end: endRot, t0: performance.now(), dur: 750 };
        this.printLabelElement.innerHTML = `<strong>${this.centerLabelText}</strong><br/>${this.cornerLabels[0].title.replace(': ', ':&nbsp;')}`;

        startMainLoop();
    }

    getActiveCornerIndex() {
        return this.activeCorner;
    }

    setActiveCornerIndex(i) {
        if (i < 0 || i > 2)
            return;

        this.activeCorner = i;
        const desired = -this.baseCornerAngles[i];
        const delta = shortestAngleDelta(desired, this.rotation);
        this.rotation = mod360(this.rotation + delta);
        this.animation = null;
        this.draw();
    }

    update(now) {
        if (!this.animation)
            return false;

        const t = Math.min((now - this.animation.t0) / this.animation.dur, 1);
        this.rotation = this.animation.start + (this.animation.end - this.animation.start) * easeOutCubic(t);
        if (t >= 1) {
            this.rotation = mod360(this.animation.end);
            this.animation = null;
        }

        return this.animation != null;
    }

    draw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        const centerX = width / 2;
        const centerY = height / 2;
        const corners = [];
        for (let i = 0; i < 3; i++) {
            const angle = degToRad(this.targetRotation + this.rotation + this.baseCornerAngles[i]);
            corners.push({
                x: centerX + Math.cos(angle) * this.radius,
                y: centerY + Math.sin(angle) * this.radius
            });
        }

        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.closePath();
        ctx.lineWidth = Constants.CATEGORY_UI_LINE_SIZE;
        ctx.strokeStyle = this.color;
        ctx.stroke();

        if (this.activeCorner !== null) {
            const corner = corners[this.activeCorner];
            ctx.beginPath();
            ctx.arc(corner.x, corner.y, this.size * 0.05, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        ctx.restore();

        for (let i = 0; i < 3; i++) {
            const labelElement = this.labelElements[i];
            labelElement.style.left = `${corners[i].x}px`;
            labelElement.style.top = `${corners[i].y}px`;
        }

        this.centerLabelElement.style.left = `${centerX}px`;
        this.centerLabelElement.style.top = `${centerY}px`;
    }

    setPrintMode(isPrintMode) {
        if (isPrintMode)
            this.container.classList.add("print-mode");
        else
            this.container.classList.remove("print-mode");
    }
}

function createCategoryUI(x, y, size, rotation, color, labels, centerText) {
    const container = document.getElementById("appControls");
    const ui = new CategoryUI(container, size, { x, y }, rotation, color, labels, centerText);
    return ui;
}

class TutorialUI {
    constructor() {
        this.currentStep = -1;

        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';

        this.highlightBox = document.createElement('div');
        this.highlightBox.className = 'tutorial-highlight-box';
        this.overlay.appendChild(this.highlightBox);

        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tutorial-tooltip';
        this.overlay.appendChild(this.tooltip);

        this.textElement = document.createElement('div');
        this.tooltip.appendChild(this.textElement);

        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'tutorial-buttons';

        this.nextButton = document.createElement('button');
        this.nextButton.innerText = 'Weiter';
        this.nextButton.addEventListener('click', () => this.nextStep());
        buttonsDiv.appendChild(this.nextButton);

        this.previousButton = document.createElement('button');
        this.previousButton.innerText = 'Zurück';
        this.previousButton.addEventListener('click', () => this.prevStep());
        buttonsDiv.appendChild(this.previousButton);

        this.skipButton = document.createElement('button');
        this.skipButton.innerText = 'Überspringen';
        this.skipButton.addEventListener('click', () => this.endTutorial());
        buttonsDiv.appendChild(this.skipButton);

        this.tooltip.appendChild(buttonsDiv);
        document.body.appendChild(this.overlay);
    }

    startTutorial(steps) {
        this.steps = steps;
        this.overlay.style.display = 'block';
        this.currentStep = 0;
        this.showStep(this.currentStep);
    }

    endTutorial() {
        this.overlay.style.display = 'none';
        this.currentStep = -1;
    }

    resize() {
        if (this.currentStep >= 0)
            this.showStep(this.currentStep);
    }

    showStep(index) {
        if (index < 0 || index >= this.steps.length)
            return;

        const step = this.steps[index];
        const element = step.element;
        if (!element)
            return;

        const rect = element.getBoundingClientRect();
        const padding = 5;
        const highlightWidthScaling = step.widthScaling != null ? step.widthScaling : 1.0;
        const highlightHeightScaling = step.heightScaling != null ? step.heightScaling : 1.0;

        const highlightWidth = rect.width * highlightWidthScaling;
        const highlightHeight = rect.height * highlightHeightScaling;
        const highlightTop = rect.top + (rect.height - highlightHeight) / 2;
        const highlightLeft = rect.left + (rect.width - highlightWidth) / 2;

        this.highlightBox.style.top = (highlightTop - padding) + 'px';
        this.highlightBox.style.left = (highlightLeft - padding) + 'px';
        this.highlightBox.style.width = (highlightWidth + padding * 2) + 'px';
        this.highlightBox.style.height = (highlightHeight + padding * 2) + 'px';

        this.tooltip.style.position = 'fixed';
        let tooltipTop = highlightTop + highlightHeight + padding * 2 + padding * 0.5;
        let tooltipLeft = highlightLeft;

        const tooltipWidth = remToPx(25);
        const tooltipHeight = remToPx(10);

        if (tooltipLeft + tooltipWidth > window.innerWidth - padding * 2)
            tooltipLeft = window.innerWidth - tooltipWidth - padding * 2;

        if (tooltipTop + tooltipHeight > window.innerHeight)
            tooltipTop = highlightTop - tooltipHeight - padding * 2;

        this.tooltip.style.top = tooltipTop + 'px';
        this.tooltip.style.left = tooltipLeft + 'px';
        this.textElement.innerText = step.text;

        this.previousButton.style.display = index === 0 ? 'none' : 'inline-block';
        this.nextButton.innerText = index === this.steps.length - 1 ? 'Fertig' : 'Weiter';

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep(this.currentStep);
        } else
            this.endTutorial();
    }

    prevStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep(this.currentStep);
        }
    }
}

/**
 * Main Loop for Category UI animation
 */

function startMainLoop() {
    if (isMainLoopRunning)
        return;

    isMainLoopRunning = true;

    function loop(now) {
        let isAnyCategoryButtonAnimating = false;

        for (const button of categoryButtons) {
            if (button.update(now))
                isAnyCategoryButtonAnimating = true;

            button.draw();
        }

        if (isAnyCategoryButtonAnimating)
            requestAnimationFrame(loop);
        else
            isMainLoopRunning = false;
    }

    requestAnimationFrame(loop);
}

/**
 * Load libraries
 */

async function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
        if (window.html2canvas) return resolve(window.html2canvas);

        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        script.onload = () => resolve(window.html2canvas);
        script.onerror = () => reject(new Error("Failed to load html2canvas"));
        document.head.appendChild(script);
    });
}

async function loadSweetAlert2() {
    return new Promise((resolve, reject) => {
        if (window.swal) return resolve(window.swal);

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/sweetalert2@11";
        script.onload = () => resolve(window.swal);
        script.onerror = () => reject(new Error("Failed to load SweetAlert2"));
        document.head.appendChild(script);
    });
}

/**
 * Helper/Util Functions
 */

const degToRad = d => d * Math.PI / 180;

const radToDeg = r => r * 180 / Math.PI;

const mod360 = n => ((n % 360) + 360) % 360;

function shortestAngleDelta(to, from) {
    const raw = mod360(to) - mod360(from);
    return raw > 180 ? raw - 360 : raw < -180 ? raw + 360 : raw;
}

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function shadeColor(color, percent) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt, G = (num >> 8 & 0x00FF) + amt, B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
}

function getCategoryAngle(index, count) {
    const angleStep = (2 * Math.PI) / count;
    return (Math.PI * 3 / 2 + index * angleStep) % (Math.PI * 2);
}

function getGraphRadius(canvas) {
    return Math.min(canvas.width, canvas.height) / 2 - Constants.CATEGORY_UI_SIZE * 2;
}

function getProfileColor(index, step = 137.508) {
    const hue = (index * step) % 360;
    const saturation = 80;
    const lightness = 40;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function remToPx(rem) {
    const remInPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return rem * remInPx;
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function generateProfileID() {
    const id = profiles.length;
    return id;
}