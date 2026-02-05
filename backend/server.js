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

// Modelo de Producto
const productoSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true },
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

// Modelo de Venta
const ventaSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  productos: [{
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    codigo: { type: String, required: true },
    nombre: { type: String, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true },
    subtotal: { type: Number, required: true }
  }],
  total: { type: Number, required: true },
  iva: Number,
  cliente: String,
});
const Venta = mongoose.model('Venta', ventaSchema);

// Modelo de Compra
const compraSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  productos: [{
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    codigo: { type: String, required: true },
    nombre: { type: String, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true },
    subtotal: { type: Number, required: true }
  }],
  total: { type: Number, required: true },
  iva: Number,
  proveedor: String,
});
const Compra = mongoose.model('Compra', compraSchema);

// Modelo de Pago
const pagoSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  monto: Number,
  metodo: String,
  compraRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Compra' },
  proveedor: String,
});
const Pago = mongoose.model('Pago', pagoSchema);

// Modelo de Cobro
const cobroSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  monto: Number,
  metodo: String,
  ventaRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Venta' },
  cliente: String,
});
const Cobro = mongoose.model('Cobro', cobroSchema);

// Rutas para Productos (asumiendo existentes; agrega si no)
app.get('/api/productos', async (req, res) => {
  const productos = await Producto.find();
  res.json(productos);
});

// Rutas para Compras
app.post('/api/compras', async (req, res) => {
  try {
    const { productos, proveedor } = req.body;
    let total = 0;
    const productosComprados = [];

    for (const item of productos) {
      const producto = await Producto.findById(item.productoId);
      if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

      const subtotal = item.precioUnitario * item.cantidad;
      total += subtotal;

      producto.stock += item.cantidad;
      await producto.save();

      productosComprados.push({
        productoId: producto._id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal
      });
    }

    const iva = total * 0.21;
    const totalConIva = total + iva;

    const nuevaCompra = new Compra({
      productos: productosComprados,
      total: totalConIva,
      iva,
      proveedor: proveedor || 'Desconocido'
    });

    await nuevaCompra.save();
    res.json(nuevaCompra);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/compras', async (req, res) => {
  const compras = await Compra.find().sort({ fecha: -1 }).limit(100);
  res.json(compras);
});

// Rutas para Ventas (similar a compras, con resta de stock)
app.post('/api/ventas', async (req, res) => {
  try {
    const { productos, cliente } = req.body;
    let total = 0;
    const productosVendidos = [];

    for (const item of productos) {
      const producto = await Producto.findById(item.productoId);
      if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
      if (producto.stock < item.cantidad) return res.status(400).json({ error: 'Stock insuficiente' });

      const subtotal = item.precioUnitario * item.cantidad;
      total += subtotal;

      producto.stock -= item.cantidad;
      await producto.save();

      productosVendidos.push({
        productoId: producto._id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal
      });
    }

    const iva = total * 0.21;
    const totalConIva = total + iva;

    const nuevaVenta = new Venta({
      productos: productosVendidos,
      total: totalConIva,
      iva,
      cliente: cliente || 'Desconocido'
    });

    await nuevaVenta.save();
    res.json(nuevaVenta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ventas', async (req, res) => {
  const ventas = await Venta.find().sort({ fecha: -1 }).limit(100);
  res.json(ventas);
});

// Rutas para Pagos y Cobros (mantenidas simples)
app.post('/api/pagos', async (req, res) => {
  try {
    const nuevoPago = new Pago(req.body);
    await nuevoPago.save();
    res.json(nuevoPago);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pagos', async (req, res) => {
  const pagos = await Pago.find().sort({ fecha: -1 }).limit(100);
  res.json(pagos);
});

app.post('/api/cobros', async (req, res) => {
  try {
    const nuevoCobro = new Cobro(req.body);
    await nuevoCobro.save();
    res.json(nuevoCobro);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cobros', async (req, res) => {
  const cobros = await Cobro.find().sort({ fecha: -1 }).limit(100);
  res.json(cobros);
});

app.listen(PORT, () => console.log(`Backend en puerto ${PORT}`));
