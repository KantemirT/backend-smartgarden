// server.js
const getLocalIP = () => {
  const interfaces = require('os').networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost';
};

const LOCAL_IP = getLocalIP();
console.log('🚀 Server IPs:', {
  local: `http://localhost:${PORT}`,
  network: `http://${LOCAL_IP}:${PORT}`,
  timestamp: new Date().toISOString()
});

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Подключение к PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'smart_garden',
  password: process.env.DB_PASSWORD || '1',
  port: process.env.DB_PORT || 5432,
});

// МОДЕЛИ (остаются без изменений)
class PredictionModels {
  predictPhenologicalPhase(weatherData, cropType) {
    const baseTemp = 10;
    let gdd = 0;
    
    weatherData.forEach(day => {
      const avgTemp = (day.maxTemp + day.minTemp) / 2;
      if (avgTemp > baseTemp) {
        gdd += avgTemp - baseTemp;
      }
    });

    const phases = {
      0: 'Покой',
      100: 'Набухание почек',
      200: 'Распускание почек', 
      300: 'Появление листьев',
      500: 'Цветение',
      800: 'Формирование ягод',
      1200: 'Веризон (созревание)',
      1600: 'Полная зрелость'
    };

    let currentPhase = 'Покой';
    let nextPhase = 'Набухание почек';
    let progress = 0;

    for (const [threshold, phase] of Object.entries(phases)) {
      if (gdd >= parseInt(threshold)) {
        currentPhase = phase;
      } else {
        nextPhase = phase;
        const prevThreshold = Object.keys(phases)[Object.keys(phases).indexOf(threshold) - 1] || 0;
        progress = ((gdd - prevThreshold) / (threshold - prevThreshold)) * 100;
        break;
      }
    }

    return {
      currentPhase,
      nextPhase,
      progress: Math.min(100, Math.max(0, progress)),
      gdd,
      daysToNextPhase: Math.ceil((Object.keys(phases).find(k => phases[k] === nextPhase) - gdd) / 10)
    };
  }

  predictDiseaseRisk(weatherData, humidity, leafWetness) {
    const risks = [];
    
    if (humidity > 90 && weatherData.temperature > 10 && weatherData.temperature < 25) {
      const riskScore = (humidity - 85) * 0.1 + (leafWetness / 10);
      risks.push({
        disease: 'Парша',
        riskLevel: riskScore > 7 ? 'high' : riskScore > 4 ? 'medium' : 'low',
        probability: Math.min(95, riskScore * 10),
        recommendation: riskScore > 7 ? 'Срочная обработка фунгицидом' : 'Профилактическая обработка'
      });
    }

    if (weatherData.temperature > 15 && weatherData.temperature < 30 && humidity > 70) {
      const riskScore = (weatherData.temperature - 15) * 0.5 + (humidity - 70) * 0.3;
      risks.push({
        disease: 'Мучнистая роса',
        riskLevel: riskScore > 6 ? 'high' : riskScore > 3 ? 'medium' : 'low',
        probability: Math.min(90, riskScore * 12),
        recommendation: 'Обработка серосодержащими препаратами'
      });
    }

    return risks;
  }
}

class EconomicCalculator {
  calculateIrrigationCost(waterVolume, electricityRate, laborCost) {
    const waterCost = waterVolume * 0.15;
    const electricityCost = (waterVolume * 0.1) * electricityRate;
    const totalCost = waterCost + electricityCost + laborCost;
    
    return {
      waterCost,
      electricityCost, 
      laborCost,
      totalCost,
      costPerHectare: totalCost
    };
  }

  calculateROI(initialInvestment, yieldIncrease, productPrice, operationalCosts) {
    const additionalRevenue = yieldIncrease * productPrice;
    const netProfit = additionalRevenue - operationalCosts;
    const roi = (netProfit / initialInvestment) * 100;
    
    return {
      additionalRevenue,
      netProfit,
      roi: Math.round(roi * 100) / 100,
      paybackPeriod: initialInvestment / netProfit
    };
  }

  calculateProductionCost(operationalCosts, yieldAmount, fixedCosts = 0) {
    const totalCost = operationalCosts + fixedCosts;
    const costPerKg = totalCost / yieldAmount;
    
    return {
      totalCost,
      costPerKg: Math.round(costPerKg * 100) / 100,
      operationalCosts,
      fixedCosts
    };
  }
}

class QuadroAPIService {
  async getEnhancedWeatherData(lat, lon) {
    try {
      return {
        temperature: 22,
        humidity: 65,
        rainfall: 0,
        windSpeed: 2.5,
        solarRadiation: 18.5,
        dewPoint: 15,
        leafWetness: 4,
        soilMoisture: 62,
        evapotranspiration: 4.2
      };
    } catch (error) {
      return this.getBasicWeatherData(lat, lon);
    }
  }

  async getSoilAnalysis(gardenId) {
    return {
      pH: 6.8,
      organicMatter: 2.3,
      nitrogen: 45,
      phosphorus: 35,
      potassium: 120,
      salinity: 0.8
    };
  }

  async getLeafAnalysis(gardenId) {
    return {
      nitrogen: 2.8,
      phosphorus: 0.3,
      potassium: 1.9,
      calcium: 1.2,
      magnesium: 0.4
    };
  }
}

const predictionModels = new PredictionModels();
const economicCalculator = new EconomicCalculator();
const quadroAPI = new QuadroAPIService();

// Middleware для логирования
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==================== API ПОЛЬЗОВАТЕЛЕЙ ====================

// Регистрация пользователя
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    console.log('Регистрация пользователя:', { name, email, phone });

    // Проверяем обязательные поля
    if (!name || !password) {
      return res.status(400).json({
        success: false,
        error: 'Имя и пароль обязательны для заполнения'
      });
    }

    // Проверяем существование пользователя
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Пользователь с таким email или телефоном уже существует'
      });
    }

    // Создаем пользователя
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, phone, created_at, updated_at`,
      [name, email, phone, password, new Date(), new Date()]
    );

    const newUser = result.rows[0];
    
    console.log('Пользователь создан:', newUser.id);

    res.json({
      success: true,
      user: newUser
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка регистрации: ' + error.message 
    });
  }
});

// Вход пользователя
app.post('/api/users/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    console.log('Попытка входа:', login);

    // Ищем пользователя по email или телефону
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR phone = $1',
      [login]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    const user = result.rows[0];

    // Проверяем пароль
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Неверный пароль'
      });
    }

    // Убираем пароль из ответа
    const { password: _, ...userWithoutPassword } = user;

    console.log('Успешный вход:', user.id);

    res.json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка входа: ' + error.message 
    });
  }
});

// Получение пользователя по ID
app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT id, name, email, phone, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка получения пользователя: ' + error.message 
    });
  }
});

// Обновление пользователя
app.put('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone } = req.body;

    console.log('Обновление пользователя:', userId, { name, email, phone });

    // Проверяем существование пользователя
    const userExists = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    // Проверяем уникальность email и телефона
    if (email || phone) {
      const duplicateCheck = await pool.query(
        'SELECT * FROM users WHERE (email = $1 OR phone = $2) AND id != $3',
        [email, phone, userId]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Пользователь с таким email или телефоном уже существует'
        });
      }
    }

    // Строим запрос динамически
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }
    if (email) {
      updates.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }
    if (phone) {
      updates.push(`phone = $${paramCount}`);
      values.push(phone);
      paramCount++;
    }

    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    paramCount++;

    values.push(userId);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING id, name, email, phone, created_at, updated_at
    `;

    const result = await pool.query(query, values);
    const updatedUser = result.rows[0];

    console.log('Пользователь обновлен:', updatedUser.id);

    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка обновления пользователя: ' + error.message 
    });
  }
});

// Получение всех пользователей
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка получения пользователей: ' + error.message 
    });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date()
    });
  } catch (error) {
    res.json({
      success: false,
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'Backend работает!',
    timestamp: new Date()
  });
});

// Обработка несуществующих маршрутов
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Обработка ошибок
app.use((error, req, res, next) => {
  console.error('🚨 Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    const client = await pool.connect();
    console.log('✅ База данных подключена успешно');
    
    // Проверяем существование таблицы пользователей
    try {
      await client.query('SELECT 1 FROM users LIMIT 1');
      console.log('✅ Таблица users существует');
    } catch (error) {
      console.log('❌ Таблица users не существует, создаем...');
      
      // Создаем таблицу пользователей
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(100) UNIQUE,
          phone VARCHAR(20) UNIQUE,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Создаем тестового пользователя
      await client.query(`
        INSERT INTO users (name, email, phone, password) 
        VALUES ('Тестовый пользователь', 'user@example.com', '+79991234567', 'password')
        ON CONFLICT (email) DO NOTHING
      `);
      
      console.log('✅ Таблица users создана успешно');
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error.message);
  }

  // Запускаем сервер на всех интерфейсах
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📡 API доступно по:`);
    console.log(`   http://localhost:${PORT}/api`);
    console.log(`   http://127.0.0.1:${PORT}/api`);
    console.log(`   http://[YOUR_IP]:${PORT}/api`);
    console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
  });
}

startServer().catch(console.error);