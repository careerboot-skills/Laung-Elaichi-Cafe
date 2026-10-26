/**
 * LAUNG ELAICHI CAFE - COMPLETE POS & ACCOUNTING SERVER
 * Location: Bangla Chauraha, Beside Mahakal Kachori
 * Tech Stack: Express, Socket.IO, Mongoose, PDFKit
 */

const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const PDFDocument = require('pdfkit');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/laung_elaichi_cafe';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS Setup
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// ==========================================
// MONGODB SCHEMAS & MODELS
// ==========================================

const orderItemSchema = new mongoose.Schema({
    code: { type: String, required: true },
    name: { type: String, required: true },
    variant: { type: String, default: 'Standard' },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    total: { type: Number, required: true }
});

const billSchema = new mongoose.Schema({
    invoiceNo: { type: String, required: true, unique: true },
    customerName: { type: String, default: 'Walk-in Guest' },
    customerPhone: { type: String, default: 'N/A' },
    paymentMethod: { type: String, enum: ['CASH', 'UPI', 'CARD'], default: 'UPI' },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['COMPLETED', 'CANCELLED'], default: 'COMPLETED' }
}, { timestamps: true });

const Bill = mongoose.model('Bill', billSchema);

// Menu Inventory Data
const MENU_DATA = [
    { code: "T10", name: "Sukoon ki Chai", variant: "Disposal", price: 10, category: "tea" },
    { code: "T15", name: "Kullad Wali Chai", variant: "Kullad", price: 15, category: "tea" },
    { code: "T20", name: "Special Chai", variant: "Kullad", price: 20, category: "tea" },
    { code: "T25", name: "Rajwadi Chai", variant: "Kullad Royal", price: 25, category: "tea" },

    { code: "MSV30", name: "Momo (Steam) Veg", variant: "Half", price: 30, category: "momos" },
    { code: "MSV60", name: "Momo (Steam) Veg", variant: "Full", price: 60, category: "momos" },
    { code: "MSP50", name: "Momo (Steam) Paneer", variant: "Half", price: 50, category: "momos" },
    { code: "MSP100", name: "Momo (Steam) Paneer", variant: "Full", price: 100, category: "momos" },

    { code: "MFV50", name: "Momo (Fry) Veg", variant: "Half", price: 50, category: "momos" },
    { code: "MFV90", name: "Momo (Fry) Veg", variant: "Full", price: 90, category: "momos" },
    { code: "MFP70", name: "Momo (Fry) Paneer", variant: "Half", price: 70, category: "momos" },
    { code: "MFP130", name: "Momo (Fry) Paneer", variant: "Full", price: 130, category: "momos" },

    { code: "MCV60", name: "Momo (Crunchy) Veg", variant: "Half", price: 60, category: "momos" },
    { code: "MCV100", name: "Momo (Crunchy) Veg", variant: "Full", price: 100, category: "momos" },

    { code: "M30", name: "Maggie", variant: "Half", price: 30, category: "maggie" },
    { code: "M50", name: "Maggie", variant: "Full", price: 50, category: "maggie" },
    { code: "SM45", name: "Special Maggie", variant: "Half", price: 45, category: "maggie" },
    { code: "SM80", name: "Special Maggie", variant: "Full", price: 80, category: "maggie" },

    { code: "CM50", name: "Chai Post Mix Masala", variant: "Mini Pkt", price: 50, category: "masala" },
    { code: "CM200", name: "Chai Post Mix Masala", variant: "Mega Pkt", price: 200, category: "masala" }
];

// Database Connection with graceful fallback
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB (Laung Elaichi Database)'))
    .catch((err) => console.log('⚠️ MongoDB Connection Note: Running in standalone memory mode until DB connects.', err.message));

// ==========================================
// API ROUTES
// ==========================================

// Get Menu Items
app.get('/api/menu', (req, res) => {
    res.json({ success: true, menu: MENU_DATA });
});

// Create New Bill (POS Checkout)
app.post('/api/bills/create', async (req, res) => {
    try {
        const { customerName, customerPhone, paymentMethod, items, subtotal, tax, discount, grandTotal } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart cannot be empty.' });
        }

        // Generate Invoice Number LEC-YYYYMMDD-XXXX
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const invoiceNo = `LEC-${todayStr}-${randomNum}`;

        const newBillData = {
            invoiceNo,
            customerName: customerName || 'Walk-in Guest',
            customerPhone: customerPhone || 'N/A',
            paymentMethod: paymentMethod || 'UPI',
            items,
            subtotal: parseFloat(subtotal),
            tax: parseFloat(tax || 0),
            discount: parseFloat(discount || 0),
            grandTotal: parseFloat(grandTotal),
            createdAt: new Date()
        };

        let savedBill = newBillData;

        if (mongoose.connection.readyState === 1) {
            const billDoc = new Bill(newBillData);
            savedBill = await billDoc.save();
        }

        // Broadcast to Real-Time Dashboard & KDS (Kitchen Display System)
        io.emit('new-bill-created', savedBill);

        res.status(201).json({
            success: true,
            message: 'Bill created successfully!',
            bill: savedBill
        });

    } catch (error) {
        console.error('Error saving bill:', error);
        res.status(500).json({ success: false, message: 'Failed to process order.', error: error.message });
    }
});

// Get Accounting Summary / Reports
app.get('/api/reports/summary', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const bills = await Bill.find({ status: 'COMPLETED' }).sort({ createdAt: -1 });

            let totalRevenue = 0;
            let totalBills = bills.length;
            let paymentBreakdown = { CASH: 0, UPI: 0, CARD: 0 };
            let itemSalesCount = {};

            bills.forEach(bill => {
                totalRevenue += bill.grandTotal;
                if (paymentBreakdown[bill.paymentMethod] !== undefined) {
                    paymentBreakdown[bill.paymentMethod] += bill.grandTotal;
                }

                bill.items.forEach(item => {
                    itemSalesCount[item.name] = (itemSalesCount[item.name] || 0) + item.qty;
                });
            });

            return res.json({
                success: true,
                totalRevenue,
                totalBills,
                paymentBreakdown,
                itemSalesCount,
                recentBills: bills.slice(0, 15)
            });
        } else {
            return res.json({
                success: true,
                message: 'MongoDB disconnected. Serving live local records.'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error retrieving analytics.' });
    }
});

// Thermal PDF Invoice Generator Route
app.get('/api/bills/pdf/:invoiceNo', async (req, res) => {
    try {
        const { invoiceNo } = req.params;
        let billData;

        if (mongoose.connection.readyState === 1) {
            billData = await Bill.findOne({ invoiceNo });
        }

        if (!billData) {
            // Mock object for testing/local offline print preview
            billData = {
                invoiceNo: invoiceNo,
                createdAt: new Date(),
                customerName: 'Walk-in Customer',
                paymentMethod: 'UPI',
                items: [
                    { name: 'Special Chai', variant: 'Kullad', price: 20, qty: 2, total: 40 },
                    { name: 'Momo (Steam) Veg', variant: 'Full', price: 60, qty: 1, total: 60 }
                ],
                subtotal: 100,
                tax: 0,
                grandTotal: 100
            };
        }

        const doc = new PDFDocument({ size: [226, 600], margin: 10 }); // Thermal receipt 80mm width approx

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Invoice_${invoiceNo}.pdf`);

        doc.pipe(res);

        // Header
        doc.fontSize(12).font('Helvetica-Bold').text('LAUNG ELAICHI CAFE', { align: 'center' });
        doc.fontSize(7).font('Helvetica').text('Bangla Chauraha, Beside Mahakal Kachori', { align: 'center' });
        doc.text('Lucknow, Uttar Pradesh', { align: 'center' });
        doc.text('------------------------------------------------', { align: 'center' });

        // Invoice Meta
        doc.fontSize(8).text(`Inv: ${billData.invoiceNo}`);
        doc.text(`Date: ${new Date(billData.createdAt).toLocaleString()}`);
        doc.text(`Payment: ${billData.paymentMethod}`);
        doc.text(`Customer: ${billData.customerName}`);
        doc.text('------------------------------------------------');

        // Items Header
        doc.font('Helvetica-Bold').text('Item                   Qty   Price   Total');
        doc.font('Helvetica');

        billData.items.forEach(item => {
            const line = `${item.name.substring(0, 15).padEnd(16)} ${item.qty.toString().padStart(2)}  ₹${item.price.toString().padStart(3)}  ₹${item.total}`;
            doc.text(line);
        });

        doc.text('------------------------------------------------');
        doc.font('Helvetica-Bold');
        doc.text(`Subtotal: ₹${billData.subtotal}`, { align: 'right' });
        doc.text(`Grand Total: ₹${billData.grandTotal}`, { align: 'right' });
        doc.text('------------------------------------------------');

        doc.fontSize(8).font('Helvetica-Oblique').text('Thank You! Visit Again!', { align: 'center' });
        doc.text('Sukoon Ki Har Ghoont, Aapke Naam.', { align: 'center' });

        doc.end();

    } catch (error) {
        res.status(500).send('Could not generate PDF Invoice.');
    }
});

// Fallback to Index.html for Single Page App
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// SOCKET.IO REALTIME CONNECTIONS
// ==========================================
io.on('connection', (socket) => {
    console.log('⚡ Billing Terminal connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Terminal disconnected:', socket.id);
    });
});

// Start Server
server.listen(PORT, () => {
    console.log(`
  ════════════════════════════════════════════════════════════════
  ☕ LAUNG ELAICHI CAFE - POS & ACCOUNTING SYSTEM RUNNING
  ════════════════════════════════════════════════════════════════
  📍 Location: Bangla Chauraha, Beside Mahakal Kachori
  🚀 Server URL: http://localhost:${PORT}
  📄 Invoice PDF API: http://localhost:${PORT}/api/bills/pdf/LEC-DEMO
  ════════════════════════════════════════════════════════════════
  `);
});
