const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

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
    window: latestSensorData.window === 'open' ? '열림' : '닫힘', // 적외선 센서 기준
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
