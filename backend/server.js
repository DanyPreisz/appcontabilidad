require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado a MongoDB Atlas'))
  .catch(err => console.error('Error MongoDB:', err));

const productoSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true }, // SKU o código único
  nombre: { type: String, required: true },
  categoria: String,
  stock: { type: Number, default: 0 },
  precioCosto: Number,
  precioVenta: Number,
  proveedor: String,
  fotoUrl: String,
  fotoId: String,
  fecha: { type: Date, default: Date.now }
});

const Producto = mongoose.model('Producto', productoSchema);

// Añadir producto (con foto opcional)
app.post('/api/productos', async (req, res) => {
  try {
    const { codigo, nombre, categoria, stock, precioCosto, precioVenta, proveedor, base64Foto } = req.body;

    let fotoUrl = '';
    let fotoId = '';

    if (base64Foto) {
      const upload = await cloudinary.uploader.upload(base64Foto, {
        resource_type: 'image',
        folder: 'inventario-negocio',
      });
      fotoUrl = upload.secure_url;
      fotoId = upload.public_id;
    }

    const nuevo = new Producto({
      codigo, nombre, categoria, stock, precioCosto, precioVenta, proveedor, fotoUrl, fotoId
    });
    await nuevo.save();
    res.json(nuevo);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Código ya existe' });
    res.status(500).json({ error: err.message });
  }
});

// Modelo de Venta
const ventaSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  productos: [{
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
    codigo: String,
    nombre: String,
    cantidad: Number,
    precioUnitario: Number,
    subtotal: Number
  }],
  total: Number,
  iva: Number, // 21% por defecto
  cliente: String, // Opcional
});

const Venta = mongoose.model('Venta', ventaSchema);

// Registrar venta (actualiza stock)
app.post('/api/ventas', async (req, res) => {
  try {
    const { productos, cliente } = req.body; // productos = array de {productoId, cantidad}
    let total = 0;
    const productosVendidos = [];

    for (const item of productos) {
      const producto = await Producto.findById(item.productoId);
      if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
      if (producto.stock < item.cantidad) return res.status(400).json({ error: `Stock insuficiente para ${producto.nombre}` });

      const subtotal = producto.precioVenta * item.cantidad;
      total += subtotal;

      // Actualizar stock
      producto.stock -= item.cantidad;
      await producto.save();

      productosVendidos.push({
        productoId: producto._id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: producto.precioVenta,
        subtotal
      });
    }

    const iva = total * 0.21; // IVA 21%
    const totalConIva = total + iva;

    const nuevaVenta = new Venta({
      productos: productosVendidos,
      total: totalConIva,
      iva,
      cliente: cliente || 'Mostrador'
    });

    await nuevaVenta.save();
    res.json(nuevaVenta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar ventas
app.get('/api/ventas', async (req, res) => {
  const ventas = await Venta.find().sort({ fecha: -1 }).limit(100);
  res.json(ventas);
});





      
// Listar todos
app.get('/api/productos', async (req, res) => {
  const productos = await Producto.find().sort({ fecha: -1 });
  res.json(productos);
});

// Buscar por código, nombre o categoría
app.get('/api/productos/buscar', async (req, res) => {
  const { q } = req.query;
  const productos = await Producto.find({
    $or: [
      { codigo: { $regex: q, $options: 'i' } },
      { nombre: { $regex: q, $options: 'i' } },
      { categoria: { $regex: q, $options: 'i' } }
    ]
  });
  res.json(productos);
});

// Actualizar stock (entrada/salida)
app.patch('/api/productos/:id/stock', async (req, res) => {
  const { cantidad } = req.body; // positivo = entrada, negativo = salida
  try {
    const producto = await Producto.findById(req.params.id);
    producto.stock += cantidad;
    if (producto.stock < 0) producto.stock = 0;
    await producto.save();
    res.json(producto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar
app.delete('/api/productos/:id', async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (producto.fotoId) await cloudinary.uploader.destroy(producto.fotoId);
    await producto.deleteOne();
    res.json({ mensaje: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Backend inventario en puerto ${PORT}`));
