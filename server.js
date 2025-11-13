// server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Авто-определение порта для Render
const PORT = process.env.PORT || 3000;

// Умное подключение к БД
const getDatabaseConfig = () => {
  // Если есть DATABASE_URL (Render) - используем облачную БД с SSL
  if (process.env.DATABASE_URL) {
    console.log('🔗 Подключение к облачной БД Render');
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    };
  }
  
  // Для локальной разработки - используем локальную БД без SSL
  console.log('💻 Подключение к локальной БД');
  return {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'smart_garden',
    password: process.env.DB_PASSWORD || '1',
    port: process.env.DB_PORT || 5432
  };
};

const pool = new Pool(getDatabaseConfig());

// Функция инициализации базы данных
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Проверка и создание таблиц в базе данных...');
    
    // Таблица пользователей
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
    
    // Таблица данных сада
    await client.query(`
      CREATE TABLE IF NOT EXISTS garden_data (
        id SERIAL PRIMARY KEY,
        garden_id INTEGER NOT NULL,
        temperature DECIMAL(4,2),
        humidity DECIMAL(4,2),
        light_level INTEGER,
        soil_moisture DECIMAL(4,2),
        co2_level INTEGER,
        weather_description VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Таблица настроек полива
    await client.query(`
      CREATE TABLE IF NOT EXISTS watering_settings (
        id SERIAL PRIMARY KEY,
        garden_id INTEGER NOT NULL,
        is_watering BOOLEAN DEFAULT false,
        time_left INTEGER DEFAULT 0,
        end_time TIMESTAMP,
        selected_hours INTEGER DEFAULT 0,
        selected_minutes INTEGER DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица исторических данных для аналитики
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_data (
        id SERIAL PRIMARY KEY,
        garden_id INTEGER NOT NULL,
        metric_type VARCHAR(50) NOT NULL,
        value DECIMAL(6,2) NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Проверяем существование тестового пользователя перед созданием
    const userCheck = await client.query(
      'SELECT id FROM users WHERE phone = $1 OR email = $2',
      ['+79991234567', 'test@example.com']
    );
    
    if (userCheck.rows.length === 0) {
      // Создаем тестового пользователя только если его нет
      await client.query(`
        INSERT INTO users (name, email, phone, password) 
        VALUES ('Тестовый пользователь', 'test@example.com', '+79991234567', 'password123')
      `);
      console.log('✅ Тестовый пользователь создан');
    } else {
      console.log('✅ Тестовый пользователь уже существует');
    }

    // Создаем тестовые исторические данные для аналитики
    await generateSampleAnalyticsData(client);
    
    console.log('✅ База данных готова к работе');
    
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error.message);
  } finally {
    client.release();
  }
}

// Генерация тестовых данных для аналитики
async function generateSampleAnalyticsData(client) {
  try {
    // Проверяем, есть ли уже данные
    const dataCheck = await client.query(
      'SELECT COUNT(*) FROM analytics_data WHERE garden_id = 1'
    );
    
    if (parseInt(dataCheck.rows[0].count) > 0) {
      console.log('✅ Тестовые данные аналитики уже существуют');
      return;
    }

    console.log('📊 Генерация тестовых данных для аналитики...');
    
    const now = new Date();
    const metrics = ['temperature', 'humidity', 'soil_moisture', 'light_level', 'co2_level'];
    
    // Генерируем данные за последние 30 дней
    for (let day = 29; day >= 0; day--) {
      const date = new Date(now);
      date.setDate(date.getDate() - day);
      
      // 3-5 записей в день для каждого типа метрик
      const recordsPerDay = 3 + Math.floor(Math.random() * 3);
      
      for (let record = 0; record < recordsPerDay; record++) {
        const recordTime = new Date(date);
        recordTime.setHours(6 + Math.floor(Math.random() * 12)); // С 6 утра до 6 вечера
        recordTime.setMinutes(Math.floor(Math.random() * 60));
        
        for (const metric of metrics) {
          let value;
          
          switch (metric) {
            case 'temperature':
              value = 20 + Math.sin(day * 0.2) * 5 + (Math.random() - 0.5) * 3;
              break;
            case 'humidity':
              value = 60 + Math.cos(day * 0.3) * 10 + (Math.random() - 0.5) * 5;
              break;
            case 'soil_moisture':
              value = 45 + Math.sin(day * 0.4) * 15 + (Math.random() - 0.5) * 4;
              break;
            case 'light_level':
              value = 1200 + Math.sin(day * 0.5) * 400 + (Math.random() - 0.5) * 200;
              break;
            case 'co2_level':
              value = 420 + Math.cos(day * 0.6) * 30 + (Math.random() - 0.5) * 15;
              break;
          }
          
          await client.query(
            `INSERT INTO analytics_data (garden_id, metric_type, value, recorded_at) 
             VALUES ($1, $2, $3, $4)`,
            [1, metric, Math.round(value * 100) / 100, recordTime]
          );
        }
      }
    }
    
    console.log('✅ Тестовые данные аналитики созданы');
  } catch (error) {
    console.error('❌ Ошибка генерации тестовых данных:', error.message);
  }
}

// МОДЕЛИ
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

// ==================== API ДАННЫХ САДА ====================

// Получение текущих данных сада
app.get('/api/garden/:gardenId/current-data', async (req, res) => {
  try {
    const { gardenId } = req.params;
    
    console.log(`Получение данных сада для gardenId: ${gardenId}`);
    
    // В реальном приложении здесь будет запрос к БД
    // Пока используем реалистичные мок-данные
    const gardenData = {
      id: parseInt(gardenId),
      temperature: 24 + Math.floor(Math.random() * 5),
      humidity: 65 + Math.floor(Math.random() * 10),
      lightLevel: 1200 + Math.floor(Math.random() * 200),
      soilMoisture: 45 + Math.floor(Math.random() * 10),
      co2Level: 420 + Math.floor(Math.random() * 30),
      weatherDescription: 'ясно',
      lastUpdate: new Date().toISOString()
    };

    console.log('Отправка данных сада:', gardenData);

    res.json({
      success: true,
      data: gardenData
    });
  } catch (error) {
    console.error('Garden data error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения данных сада: ' + error.message
    });
  }
});

// Получение данных фертигации
app.get('/api/garden/:gardenId/fertigation-recipes', async (req, res) => {
  try {
    const { gardenId } = req.params;
    
    console.log(`Получение данных фертигации для gardenId: ${gardenId}`);
    
    const fertigationData = {
      id: parseInt(gardenId),
      pH: 6.5,
      ec: 2.1,
      nutrients: {
        nitrogen: 150,
        phosphorus: 50,
        potassium: 200,
        calcium: 120,
        magnesium: 60
      },
      schedule: 'каждые 4 часа',
      recommendations: 'Все показатели в норме. Продолжайте текущий режим фертигации.',
      lastUpdate: new Date().toISOString()
    };

    res.json({
      success: true,
      data: fertigationData
    });
  } catch (error) {
    console.error('Fertigation data error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения данных фертигации: ' + error.message
    });
  }
});

// Получение экономических данных
app.get('/api/garden/:gardenId/economics', async (req, res) => {
  try {
    const { gardenId } = req.params;
    
    console.log(`Получение экономических данных для gardenId: ${gardenId}`);
    
    const economicsData = {
      id: parseInt(gardenId),
      costs: 15000,
      revenue: 45000,
      profit: 30000,
      yield: 1200,
      efficiency: 85,
      lastUpdate: new Date().toISOString()
    };

    res.json({
      success: true,
      data: economicsData
    });
  } catch (error) {
    console.error('Economics data error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения экономических данных: ' + error.message
    });
  }
});

// Получение рекомендаций и данных о заболеваниях
app.get('/api/garden/:gardenId/complex-recommendations', async (req, res) => {
  try {
    const { gardenId } = req.params;
    
    console.log(`Получение рекомендаций для gardenId: ${gardenId}`);
    
    const diseaseData = {
      id: parseInt(gardenId),
      risk: 'низкий',
      recommendations: 'Профилактическая обработка не требуется. Поддерживайте текущие условия.',
      lastInspection: new Date().toISOString().split('T')[0],
      issues: [],
      activeIssues: [],
      lastUpdate: new Date().toISOString()
    };

    res.json({
      success: true,
      data: diseaseData
    });
  } catch (error) {
    console.error('Disease data error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения данных о заболеваниях: ' + error.message
    });
  }
});

// ==================== API АНАЛИТИКИ И ИСТОРИЧЕСКИХ ДАННЫХ ====================

// Получение исторических данных для аналитики
app.get('/api/garden/:gardenId/analytics/history', async (req, res) => {
  try {
    const { gardenId } = req.params;
    const { period = 'week', metric = 'all' } = req.query;
    
    console.log(`Получение исторических данных для gardenId: ${gardenId}, период: ${period}, метрика: ${metric}`);

    // Определяем временной диапазон
    const now = new Date();
    const startDate = new Date(now);
    
    if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate.setDate(now.getDate() - 30);
    } else if (period === 'quarter') {
      startDate.setDate(now.getDate() - 90);
    } else {
      startDate.setDate(now.getDate() - 7); // По умолчанию неделя
    }

    // Получаем данные из БД
    let query = `
      SELECT metric_type, value, recorded_at 
      FROM analytics_data 
      WHERE garden_id = $1 AND recorded_at >= $2
    `;
    let params = [gardenId, startDate];

    if (metric !== 'all') {
      query += ' AND metric_type = $3';
      params.push(metric);
    }

    query += ' ORDER BY recorded_at ASC';

    const result = await pool.query(query, params);

    // Группируем данные по метрикам и датам
    const groupedData = {};
    const metricsData = {};

    result.rows.forEach(row => {
      const date = row.recorded_at.toISOString().split('T')[0];
      const metricType = row.metric_type;
      
      if (!groupedData[date]) {
        groupedData[date] = {};
      }
      
      if (!groupedData[date][metricType]) {
        groupedData[date][metricType] = [];
      }
      
      groupedData[date][metricType].push({
        value: parseFloat(row.value),
        timestamp: row.recorded_at
      });
    });

    // Рассчитываем средние значения по дням для каждой метрики
    Object.keys(groupedData).forEach(date => {
      Object.keys(groupedData[date]).forEach(metricType => {
        const values = groupedData[date][metricType];
        const avgValue = values.reduce((sum, item) => sum + item.value, 0) / values.length;
        
        if (!metricsData[metricType]) {
          metricsData[metricType] = [];
        }
        
        metricsData[metricType].push({
          label: new Date(date).getDate().toString(),
          value: Math.round(avgValue * 10) / 10,
          date: date,
          timestamp: values[0].timestamp
        });
      });
    });

    // Если данных нет, генерируем демо-данные
    if (Object.keys(metricsData).length === 0) {
      console.log('Нет данных в БД, генерируем демо-данные');
      metricsData.temperature = generateDemoData(period, 24, 3, 18, 35);
      metricsData.humidity = generateDemoData(period, 65, 8, 30, 85);
      metricsData.soil_moisture = generateDemoData(period, 45, 6, 20, 80);
      metricsData.light_level = generateDemoData(period, 1200, 200, 800, 2000);
      metricsData.co2_level = generateDemoData(period, 420, 30, 380, 500);
    }

    const responseData = {
      metrics: metricsData,
      period,
      metric,
      dataPoints: result.rows.length,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString()
      },
      lastUpdate: new Date().toISOString()
    };

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Analytics history error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения исторических данных: ' + error.message
    });
  }
});

// Генерация демо-данных для аналитики
function generateDemoData(period, baseValue, variance, min, max) {
  const dataPoints = period === 'week' ? 7 : 30;
  const data = [];
  let currentValue = baseValue;
  
  for (let i = dataPoints - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Добавляем тренд и случайные колебания
    const trend = (Math.random() - 0.5) * 0.3;
    const randomChange = (Math.random() - 0.5) * variance;
    currentValue += trend + randomChange;
    
    // Ограничиваем значения
    currentValue = Math.max(min, Math.min(max, currentValue));
    
    data.push({
      label: date.getDate().toString(),
      value: Math.round(currentValue * 10) / 10,
      date: date.toISOString().split('T')[0],
      timestamp: date.toISOString()
    });
  }
  
  return data;
}

// Получение статистики по данным
app.get('/api/garden/:gardenId/analytics/stats', async (req, res) => {
  try {
    const { gardenId } = req.params;
    const { period = 'week' } = req.query;
    
    console.log(`Получение статистики для gardenId: ${gardenId}, период: ${period}`);

    // Получаем исторические данные
    const historyResponse = await pool.query(
      `SELECT metric_type, AVG(value) as avg_value, MIN(value) as min_value, 
              MAX(value) as max_value, COUNT(*) as data_points
       FROM analytics_data 
       WHERE garden_id = $1 AND recorded_at >= $2
       GROUP BY metric_type`,
      [gardenId, getStartDate(period)]
    );

    const stats = {};
    
    // Если есть данные в БД
    if (historyResponse.rows.length > 0) {
      historyResponse.rows.forEach(row => {
        stats[row.metric_type] = {
          average: Math.round(row.avg_value * 10) / 10,
          min: Math.round(row.min_value * 10) / 10,
          max: Math.round(row.max_value * 10) / 10,
          dataPoints: parseInt(row.data_points)
        };
      });
    } else {
      // Генерируем демо-статистику
      const demoStats = {
        temperature: { average: 24.5, min: 18.2, max: 29.8, dataPoints: period === 'week' ? 21 : 90 },
        humidity: { average: 65.2, min: 45.1, max: 82.3, dataPoints: period === 'week' ? 21 : 90 },
        soil_moisture: { average: 47.8, min: 32.5, max: 68.9, dataPoints: period === 'week' ? 21 : 90 },
        light_level: { average: 1250, min: 850, max: 1850, dataPoints: period === 'week' ? 21 : 90 },
        co2_level: { average: 425, min: 395, max: 485, dataPoints: period === 'week' ? 21 : 90 }
      };
      
      Object.assign(stats, demoStats);
    }

    res.json({
      success: true,
      data: {
        stats,
        period,
        lastUpdate: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Analytics stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения статистики: ' + error.message
    });
  }
});

// Вспомогательная функция для получения даты начала периода
function getStartDate(period) {
  const now = new Date();
  const startDate = new Date(now);
  
  switch (period) {
    case 'week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate.setDate(now.getDate() - 30);
      break;
    case 'quarter':
      startDate.setDate(now.getDate() - 90);
      break;
    default:
      startDate.setDate(now.getDate() - 7);
  }
  
  return startDate;
}

// Сохранение текущих данных в историю
app.post('/api/garden/:gardenId/analytics/record', async (req, res) => {
  try {
    const { gardenId } = req.params;
    const { metrics } = req.body;
    
    console.log(`Сохранение метрик для gardenId: ${gardenId}`, metrics);

    const now = new Date();
    const queries = [];

    Object.keys(metrics).forEach(metricType => {
      queries.push(
        pool.query(
          `INSERT INTO analytics_data (garden_id, metric_type, value, recorded_at) 
           VALUES ($1, $2, $3, $4)`,
          [gardenId, metricType, metrics[metricType], now]
        )
      );
    });

    await Promise.all(queries);

    res.json({
      success: true,
      message: `Сохранено ${queries.length} метрик`,
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error('Record analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сохранения метрик: ' + error.message
    });
  }
});

// Сохранение данных сада в БД
app.post('/api/garden/:gardenId/data', async (req, res) => {
  try {
    const { gardenId } = req.params;
    const { temperature, humidity, lightLevel, soilMoisture, co2Level, weatherDescription } = req.body;

    const result = await pool.query(
      `INSERT INTO garden_data (garden_id, temperature, humidity, light_level, soil_moisture, co2_level, weather_description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [gardenId, temperature, humidity, lightLevel, soilMoisture, co2Level, weatherDescription]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Save garden data error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сохранения данных сада'
    });
  }
});

// Получение истории данных сада
app.get('/api/garden/:gardenId/history', async (req, res) => {
  try {
    const { gardenId } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM garden_data 
       WHERE garden_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [gardenId]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get garden history error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения истории данных'
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
      timestamp: new Date(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.json({
      success: false,
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date(),
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'Backend работает!',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development'
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

async function startServer() {
  try {
    // Инициализируем базу данных
    await initializeDatabase();
    
    // Проверяем подключение
    const client = await pool.connect();
    console.log('✅ База данных подключена успешно');
    client.release();
    
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error.message);
    console.log('⚠️  Работаем без базы данных (мок-данные)');
  }

  // Запускаем сервер
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Cloud' : 'Local'}`);
    console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
    console.log(`📊 Analytics API: http://localhost:${PORT}/api/garden/1/analytics/history`);
  });
}

startServer().catch(console.error);
