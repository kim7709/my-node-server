const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 정적파일 서빙: public 폴더 내 파일들 제공
app.use(express.static(path.join(__dirname, 'public')));

const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');
const topicPrefix = 'mykmou/window25/';
const sensorTopics = [
  'sensor/temperature',
  'sensor/humidity',
  'sensor/motion',
  'sensor/window',
  'sensor/sound',
  'sensor/distance',
  'sensor/vibration',
  'sensor/window_motor_state',
  'sensor/danger'
];

let latestSensorData = {};

mqttClient.on('connect', () => {
  console.log('✅ MQTT 브로커에 연결되었습니다.');
  sensorTopics.forEach(topic => {
    mqttClient.subscribe(topicPrefix + topic, err => {
      if (err) {
        console.error(`❌ ${topic} 구독 실패:`, err);
      }
    });
  });
});

mqttClient.on('message', (topic, message) => {
  const key = topic.replace(topicPrefix + 'sensor/', '');
  latestSensorData[key] = message.toString();
  console.log(`📩 수신된 메시지 - ${key}: ${latestSensorData[key]}`);
});

app.get('/api/status', (req, res) => {
  const vibrationDetected = latestSensorData.vibration === '1';
  const soundDetected = latestSensorData.sound === '1';
  const distance = parseFloat(latestSensorData.distance || '0');

  const distanceThreshold = 50; // cm 이하일 경우 모션 감지로 판단
  const motionDetected = vibrationDetected || soundDetected || distance < distanceThreshold;

  res.json({
    temperature: latestSensorData.temperature || '--',
    humidity: latestSensorData.humidity || '--',
    motion: motionDetected ? '감지됨' : '없음',
    window: latestSensorData.window === 'open' ? '열림' : '닫힘',
    sound: soundDetected ? '감지됨' : '없음',
    distance: latestSensorData.distance || '--',
    vibration: vibrationDetected ? '감지됨' : '없음',
    window_motor_state: latestSensorData.window_motor_state || '--',
    danger: latestSensorData.danger === 'true' ? '위험' : '안전'
  });
});

app.post('/api/control', (req, res) => {
  const action = req.body.action;
  if (['open', 'close'].includes(action)) {
    mqttClient.publish(topicPrefix + 'control', action);
    res.json({ status: `명령 '${action}' 전송 완료` });
  } else {
    res.status(400).json({ error: '잘못된 명령어입니다.' });
  }
});

// (선택) 이미지 업로드 및 리스트 API 예시
// 필요 없으면 삭제 가능
const multer = require('multer');
const fs = require('fs');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  res.json({ filename: req.file.filename, url: `/uploads/${req.file.filename}` });
});

app.get('/images/list', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: '파일 목록을 불러올 수 없습니다.' });
    const images = files.map(filename => ({ filename, url: `/uploads/${filename}` }));
    res.json(images);
  });
});

// 업로드 폴더 정적 서빙
app.use('/uploads', express.static(uploadDir));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
