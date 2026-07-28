const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
//const port = 57431;
const PORT = process.env.PORT || 3000;

// Middlewares: Permitir conexión desde React y parsear JSON
app.use(cors());
app.use(express.json());

// 1. Configuración de conexión a MySQL (XAMPP por defecto es root sin clave)
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost'
  user: process.env.DB_USER || 'root'
  password: process.env.DB_PASSWORD || ''
  database: process.env.DB_NAME || 'railway'
  port: process.env.DB_PORT || 3306
})

db.connect(err => {
  if (err) {
    console.error('Error conectando a la base de datos MySQL:', err);
    return;
  }
  console.log('Conexión exitosa a MySQL (smrp_dashboard).');
});

// 2. ENDPOINT: Obtener todos los registros (Lectura para el Dashboard)
app.get('/api/kpis', (req, res) => {
  const query = 'SELECT * FROM kpi_mensual ORDER BY mes ASC';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    // Parseamos a numérico para que el frontend (Recharts) los procese bien
    const formattedResults = results.map(row => ({
      ...row,
      disponibilidad: Number(row.disponibilidad),
      eficiencia: Number(row.eficiencia),
      calidad: Number(row.calidad),
      utilizacion: Number(row.utilizacion),
      oee: Number(row.oee),
      teep: Number(row.teep)
    }));
    res.json(formattedResults);
  });
});

// 3. ENDPOINT: Guardar un nuevo registro (Escritura desde el Formulario)
app.post('/api/kpis', (req, res) => {
  const data = req.body;
  const query = `
    INSERT INTO kpi_mensual (
      mes, equipo, parametro, tiempoTotal, dtProgramado, dtNoProgramado, idleTime,
      capacidadNominal, capacidadActual, produccionTotal, produccionMala,
      uptime, disponibilidad, eficiencia, calidad, utilizacion, oee, teep
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    data.mes, data.equipo, data.parametro, data.tiempoTotal, data.dtProgramado, data.dtNoProgramado, data.idleTime,
    data.capacidadNominal, data.capacidadActual, data.produccionTotal, data.produccionMala,
    data.uptime, data.disponibilidad, data.eficiencia, data.calidad, data.utilizacion, data.oee, data.teep
  ];

  db.query(query, values, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: result.insertId, message: 'Registro guardado exitosamente.' });
  });
});

// 4. ENDPOINT: Eliminar un registro
app.delete('/api/kpis/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM kpi_mensual WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Registro eliminado exitosamente.' });
  });
});

// Arrancar el servidor
//app.listen(port, () => {
//console.log(`API de Confiabilidad corriendo en http://localhost:${port}`);
//});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
