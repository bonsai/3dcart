import * as THREE from 'three';

const scoreElement = document.getElementById('score');
const speedElement = document.getElementById('speed');
const gameOverElement = document.getElementById('gameOver');
const finalScoreElement = document.getElementById('finalScore');

// シーン、カメラ、レンダラーのセットアップ
let scene, camera, renderer;
let car, road; // 3Dオブジェクト用変数

let gameSettings = null;

let lastSpeedupSoundPlayTime = 0; // スピードアップ効果音の最終再生時間
let accelerationTimer = 0; // 加速が続く残り時間 (ミリ秒)
let isAccelerating = false; // 現在加速中かどうか

// 設定を読み込む
async function loadSettings() {
    try {
        const response = await fetch('settings.yaml');
        const yamlText = await response.text();
        gameSettings = jsyaml.load(yamlText);
        console.log('Settings loaded:', gameSettings);
        initGame();
        playGameMusic(); // ゲーム開始時に音楽を再生
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function initThreeJS() {
    scene = new THREE.Scene();
    
    // カメラのセットアップ
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 15, 30);
    camera.lookAt(0, 0, 0);

    // レンダラーのセットアップ
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000); // 背景を黒に変更
    document.body.appendChild(renderer.domElement);

    // リサイズイベントハンドラ
    window.addEventListener('resize', onWindowResize, false);
    
    // 地面（道路）の作成
    const roadGeometry = new THREE.PlaneGeometry(30, 200, 1, 10);
    const roadMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }); // 道路を白に
    road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0;
    road.position.z = -50;
    scene.add(road);

    // 車の作成
    const carGeometry = new THREE.BoxGeometry(3, 2, 5);
    const carMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 }); // 車を灰色に変更
    car = new THREE.Mesh(carGeometry, carMaterial);
    car.position.set(0, 1, 20);
    scene.add(car);

    // 光源
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    scene.add(directionalLight);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ゲーム変数
let gameState = {
    isRunning: true,
    score: 0,
    speed: 50,
    carX: 0, 
    carY: 0, 
    roadWidth: 200, 
    roadCenterX: window.innerWidth / 2, 
    roadOffset: 0, 
    environment: 'city',
    carAcceleration: 0.3,   
    carBrake: 0.5,          
    carDeceleration: 0.1,   
    maxSpeed: 540 / 3.6,    // 540km/hをm/sに変換
    minSpeed: 10,           
    environmentChangeInterval: 1000,
    gameTime: 0,
    slopeAcceleration: 0,
    distance: 0,
    roadCurve: 0,
    roadCurveTarget: 0,
    roadCurveSpeed: 0.02,
    lastLocationChange: 0    // 最後に地名が変わった距離
};

let keys = {
    left: false,
    right: false,
    up: false,   
    down: false  
};

// 道路セグメント (現在は2D用のため、3D化に伴い調整予定)
let roadSegments = []; 
let environmentObjects3D = []; // 3Dの環境オブジェクトを格納する配列に変更

const environments = ['city', 'mountain', 'sea', 'forest'];
let currentEnvironmentIndex = 0; // 現在の環境インデックス
let environmentTimer = 0;

// 道路セグメント初期化 (3Dではこの関数はほとんど不要になる可能性あり)
function initRoadSegments() {
    // three.jsでは道路を動的に生成する代わりに、カメラとオブジェクトを動かすことで表現
}

// 環境オブジェクト生成 (3D用)
function generateEnvironmentObjects() {
    // 既存の環境オブジェクトをクリア
    environmentObjects3D.forEach(obj => {
        scene.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
    });
    environmentObjects3D = [];

    for (let i = 0; i < 100; i++) {
        let geometry;
        let material;
        let mesh;
        let size = Math.random() * 5 + 2;
        // 道路の外側に配置するように調整
        let x = (Math.random() - 0.5) * 150;
        // 道路の幅を考慮して配置
        if (Math.abs(x) < road.geometry.parameters.width / 2 + 5) {
            x = (x > 0) ? road.geometry.parameters.width / 2 + 5 : -road.geometry.parameters.width / 2 - 5;
        }
        let z = (Math.random() * 200) - 150;

        // すべてのオブジェクトを白黒に
        const color = 0xffffff; // 白
        const opacity = Math.random() * 0.5 + 0.5; // 0.5-1.0の透明度

        switch(gameState.environment) {
            case 'city':
                geometry = new THREE.BoxGeometry(size * 0.5, size * 2, size * 0.5);
                material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity });
                mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = size;
                break;
            case 'mountain':
                geometry = new THREE.ConeGeometry(size * 1.5, size * 3, 8);
                material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity });
                mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = size * 1.5;
                break;
            case 'sea':
                geometry = new THREE.SphereGeometry(size, 16, 16);
                material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity });
                mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = size * 0.2;
                break;
            case 'forest':
                const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.5, size * 1.5, 8);
                const trunkMaterial = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity });
                const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
                trunk.position.y = size * 0.75;

                const leavesGeometry = new THREE.ConeGeometry(size, size * 1.5, 8);
                const leavesMaterial = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity });
                const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
                leaves.position.y = size * 1.5 + (size * 1.5) / 2;

                mesh = new THREE.Group();
                mesh.add(trunk);
                mesh.add(leaves);
                break;
            default:
                geometry = new THREE.BoxGeometry(size, size, size);
                material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity });
                mesh = new THREE.Mesh(geometry, material);
                break;
        }
        
        if (mesh) {
            mesh.position.x = x;
            mesh.position.z = z;
            scene.add(mesh);
            environmentObjects3D.push(mesh);
        }
    }
}

// 衝突判定 (3Dに合わせて調整が必要)
function checkCollision() {
    // 道路から外れたかの判定
    const carLeft = car.position.x - car.geometry.parameters.width / 2;
    const carRight = car.position.x + car.geometry.parameters.width / 2;
    const roadLeft = -road.geometry.parameters.width / 2; 
    const roadRight = road.geometry.parameters.width / 2;

    if (carLeft < roadLeft || carRight > roadRight) {
        gameOver();
        return;
    }
}

// 道路の更新
function updateRoad() {
    if (!gameSettings) return;

    // 道路の曲がり具合を徐々に目標値に近づける
    gameState.roadCurve += (gameState.roadCurveTarget - gameState.roadCurve) * gameState.roadCurveSpeed;
    
    // ランダムな目標値を設定
    if (Math.random() < gameSettings.road.curve_change_probability) {
        gameState.roadCurveTarget = (Math.random() - 0.5) * gameSettings.road.curve_max_angle;
    }

    // 道路の位置を更新
    road.position.x = Math.sin(gameState.distance * 0.05) * 5;
    road.position.x += gameState.roadCurve * 10;

    // 車の位置も道路に合わせて更新
    car.position.x = road.position.x;
}

// 環境と地名の対応（より多くの地名を追加）
const locationNames = {
    'city': ['新宿区', '渋谷区', '港区', '千代田区', '中央区'],
    'mountain': ['富士山', '高尾山', '筑波山', '箱根山', '丹沢山'],
    'sea': ['湘南海岸', '江ノ島', '鎌倉海岸', '逗子海岸', '葉山海岸'],
    'forest': ['奥多摩', '高尾山', '多摩川', '青梅', '八王子']
};

// 現在の環境の地名インデックス
let currentLocationIndex = 0;

// 地名を更新する関数
function updateLocation() {
    if (!gameSettings) return;

    const distanceKm = gameState.distance / 1000;
    if (distanceKm - gameState.lastLocationChange >= gameSettings.display.location_change_distance) {
        gameState.lastLocationChange = distanceKm;
        currentLocationIndex = (currentLocationIndex + 1) % locationNames[gameState.environment].length;
        showLocationName(gameState.environment);
    }
}

// 地名表示
function showLocationName(location) {
    if (!gameSettings) return;

    const locationElement = document.getElementById('locationName');
    const currentLocation = locationNames[location][currentLocationIndex];
    locationElement.textContent = currentLocation;
    locationElement.style.opacity = '1';
    
    setTimeout(() => {
        locationElement.style.opacity = '0';
    }, gameSettings.display.location_display_time);
}

// ゲーム更新
function update() {
    if (!gameState.isRunning) return;
    
    // ゲーム時間の更新
    gameState.gameTime += 16;
    gameState.distance += gameState.speed / 50;

    // 加速タイマーの更新
    if (isAccelerating) {
        accelerationTimer -= 16; // 経過時間を減算
        if (accelerationTimer <= 0) {
            isAccelerating = false;
            accelerationTimer = 0;
        }
    }

    // 地名の更新
    updateLocation();

    // 坂道の加速度を適用
    gameState.slopeAcceleration = calculateSlopeAcceleration();
    gameState.speed += gameState.slopeAcceleration / 100;

    // 車の移動 (X軸方向)
    if (keys.left) {
        car.position.x -= 0.5; 
    }
    if (keys.right) {
        car.position.x += 0.5; 
    }
    
    // 慣性
    car.position.x *= 0.95;

    // スピード制御
    if (isAccelerating) { // 加速タイマーが有効な場合
        gameState.speed += gameState.carAcceleration;
    } else if (keys.down) {
        gameState.speed -= gameState.carBrake;
    } else {
        gameState.speed -= gameState.carDeceleration; 
    }

    // スピードを最小値と最大値の範囲に制限
    gameState.speed = Math.max(gameState.minSpeed, Math.min(gameState.maxSpeed, gameState.speed));
    
    // 道路の更新
    updateRoad();
    
    // 道路のスクロールを更新
    road.position.z += gameState.speed / 50; 
    if (road.position.z > 50) { 
        road.position.z = -50;
    }

    // カメラの位置を車の位置に固定
    camera.position.x = car.position.x;
    camera.position.z = car.position.z + 10;
    camera.position.y = 15;
    camera.lookAt(car.position.x, car.position.y + 5, car.position.z);
    
    // 環境オブジェクトの更新
    environmentObjects3D.forEach(obj => {
        obj.position.z += gameState.speed / 50;
        if (obj.position.z > camera.position.z + 50) {
            obj.position.z -= 200;
            obj.position.x = (Math.random() - 0.5) * 150;
            if (Math.abs(obj.position.x) < road.geometry.parameters.width / 2 + 5) {
                obj.position.x = (obj.position.x > 0) ? road.geometry.parameters.width / 2 + 5 : -road.geometry.parameters.width / 2 - 5;
            }
        }
    });
    
    // スコア更新
    gameState.score += Math.floor(gameState.speed / 100); 
    
    // 環境変更
    environmentTimer++;
    if (environmentTimer > gameState.environmentChangeInterval) {
        environmentTimer = 0;
        currentEnvironmentIndex = (currentEnvironmentIndex + 1) % environments.length; // 順番に次の環境へ
        gameState.environment = environments[currentEnvironmentIndex];
        generateEnvironmentObjects();
        currentLocationIndex = 0; // 環境が変わったら地名インデックスをリセット
        showLocationName(gameState.environment);
    }
    
    checkCollision();
    
    // UI更新
    updateUI();
}

// 描画
function draw() {
    renderer.render(scene, camera); // three.jsで描画
}

// ゲームループ
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ゲームオーバー
function gameOver() {
    gameState.isRunning = false;
    finalScoreElement.textContent = Math.floor(gameState.score);
    gameOverElement.style.display = 'block';
}

// ゲーム再開
function restartGame() {
    // 既存の環境オブジェクトをシーンから削除
    environmentObjects3D.forEach(obj => {
        scene.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
    });
    environmentObjects3D = [];

    gameState = {
        isRunning: true,
        score: 0,
        speed: 50,
        carX: 0,
        carY: 0,
        roadWidth: 200,
        roadCenterX: window.innerWidth / 2,
        roadOffset: 0,
        environment: 'city',
        carAcceleration: 0.3,
        carBrake: 0.5,
        carDeceleration: 0.1,
        maxSpeed: 540 / 3.6,
        minSpeed: 10,
        environmentChangeInterval: 1000,
        gameTime: 0,
        slopeAcceleration: 0,
        distance: 0,
        roadCurve: 0,
        roadCurveTarget: 0,
        roadCurveSpeed: 0.02,
        lastLocationChange: 0
    };
    currentLocationIndex = 0;
    currentEnvironmentIndex = 0; // 環境インデックスをリセット
    keys = {
        left: false,
        right: false,
        up: false,
        down: false
    };
    environmentTimer = 0;
    car.position.set(0, 1, 20); 
    road.position.z = -50; 
    generateEnvironmentObjects();
    gameOverElement.style.display = 'none';
}

// コントロール
document.getElementById('leftBtn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys.left = true;
});

document.getElementById('leftBtn').addEventListener('touchend', (e) => {
    e.preventDefault();
    keys.left = false;
});

document.getElementById('rightBtn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys.right = true;
});

document.getElementById('rightBtn').addEventListener('touchend', (e) => {
    e.preventDefault();
    keys.right = false;
});

// キーボード操作
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = true;
        e.preventDefault();
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = true;
        e.preventDefault();
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (!isAccelerating) { // 既に加速中でなければ
            accelerationTimer = 15000; // 15秒間加速
            isAccelerating = true;
        }
        const currentTime = Date.now();
        if (currentTime - lastSpeedupSoundPlayTime >= 3000) { // 3秒に1回だけ再生
            playSpeedupSound();
            lastSpeedupSoundPlayTime = currentTime;
        }
        e.preventDefault();
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        keys.down = true;
        playBrakeSound(); // ブレーキ効果音を再生
        // speedupSoundが再生中であれば停止する
        const speedupSound = document.getElementById('speedupSound');
        if (speedupSound && !speedupSound.paused) {
            speedupSound.pause();
            speedupSound.currentTime = 0; // 再生位置をリセット
        }
        e.preventDefault();
    }
    if (e.key === ' ' || e.key === 'Spacebar') { // スペースキー
        if (!gameState.isRunning) {
            restartGame();
        }
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = false;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = false;
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        // keys.up = false; // キーを離しても加速を継続するため削除
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        keys.down = false;
    }
});

// 加速度センサー対応 (three.jsでも利用可能だが、一旦そのまま)
if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
        if (gameState.isRunning && e.gamma !== null) {
            const tilt = e.gamma; // -90 to 90
            if (tilt < -10) {
                keys.left = true;
                keys.right = false;
            } else if (tilt > 10) {
                keys.right = true;
                keys.left = false;
            } else {
                keys.left = false;
                keys.right = false;
            }
        }
    });
}

// 坂道の設定
const slopeSettings = [
    { time: 10, acceleration: 5 },
    { time: 20, acceleration: 5 },
    { time: 30, acceleration: 0 },
    { time: 40, acceleration: -10 }
];

// 坂道の加速度を計算する関数
function calculateSlopeAcceleration() {
    const currentTime = Math.floor(gameState.gameTime / 1000); // 秒単位に変換
    for (let i = 0; i < slopeSettings.length; i++) {
        if (currentTime <= slopeSettings[i].time) {
            return slopeSettings[i].acceleration;
        }
    }
    return slopeSettings[slopeSettings.length - 1].acceleration;
}

// UI更新
function updateUI() {
    if (!gameSettings) return;

    const ui = document.querySelector('.ui');
    ui.innerHTML = '';

    // 経過時間
    const timeElement = document.createElement('div');
    timeElement.textContent = `経過時間: ${Math.floor(gameState.gameTime / 1000)}秒`;
    ui.appendChild(timeElement);

    // 時速（表示用に調整）
    const actualSpeedKmh = gameState.speed * 3.6;
    const displaySpeedKmh = Math.min(
        gameSettings.game.display_max_speed,
        Math.floor(actualSpeedKmh * (gameSettings.game.display_max_speed / gameSettings.game.max_speed))
    );
    const speedElement = document.createElement('div');
    speedElement.textContent = `時速: ${displaySpeedKmh}km/h`;
    ui.appendChild(speedElement);

    // 距離
    const displayDistanceKm = Math.floor(gameState.gameTime / 100); // 100msで1km進むように表示
    const distanceElement = document.createElement('div');
    distanceElement.textContent = `距離: ${displayDistanceKm}km`;
    ui.appendChild(distanceElement);

    // 地名
    const locationElement = document.createElement('div');
    locationElement.textContent = locationNames[gameState.environment][currentLocationIndex];
    ui.appendChild(locationElement);
}

// ゲーム音楽の再生関数
function playGameMusic() {
    const music = document.getElementById('gameMusic');
    if (music) {
        music.volume = 0.3; // 音量を調整
        music.play().catch(error => {
            console.log("音楽の自動再生がブロックされました。ユーザー操作が必要です。", error);
            // ユーザー操作を促すメッセージ表示などの処理を追加することもできます
        });
    }
}

// 効果音の再生関数
function playBrakeSound() {
    const sound = document.getElementById('brakeSound');
    if (sound) {
        sound.currentTime = 0; // 再生位置を最初に戻す
        sound.play();
    }
}

function playSpeedupSound() {
    const sound = document.getElementById('speedupSound');
    if (sound) {
        sound.currentTime = 0; // 再生位置を最初に戻す
        sound.play();
    }
}

// ゲーム初期化
function initGame() {
    initThreeJS();
    generateEnvironmentObjects();
    gameLoop();
}

// 設定を読み込んでからゲームを開始
loadSettings(); 