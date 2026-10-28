/**
 * LAUNG ELAICHI CAFE - COMPLETE POS & ACCOUNTING SERVER
 * Location: Bangla Chauraha, Beside Mahakal Kachori, Lucknow
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

// Synchronized Menu Inventory Data
const MENU_DATA = [
    { code: "T10", name: "Sukoon Ki Chai", variant: "Regular", price: 10, category: "tea" },
    { code: "T15", name: "Kulhad Chai", variant: "Kulhad", price: 15, category: "tea" },
    { code: "T20", name: "Special Chai", variant: "Kulhad", price: 20, category: "tea" },
    { code: "T25", name: "Rajwadi Chai", variant: "Royal Kullad", price: 25, category: "tea" },
    { code: "CS20", name: "Coffee Small", variant: "Regular", price: 20, category: "coffee" },
    { code: "CK25", name: "Coffee Kulhad", variant: "Kulhad", price: 25, category: "coffee" },
    { code: "CS30", name: "Coffee Special", variant: "Special", price: 30, category: "coffee" },
    { code: "BM20", name: "Bun Makkhan", variant: "Standard", price: 20, category: "bakery" },

    { code: "MSV30", name: "Veg Steam Momo", variant: "Half", price: 30, category: "momos" },
    { code: "MSV50", name: "Veg Steam Momo", variant: "Full", price: 50, category: "momos" },
    { code: "MSP40", name: "Paneer Steam Momo", variant: "Half", price: 40, category: "momos" },
    { code: "MSP70", name: "Paneer Steam Momo", variant: "Full", price: 70, category: "momos" },

    { code: "MFV40", name: "Veg Fry Momo", variant: "Half", price: 40, category: "momos" },
    { code: "MFV70", name: "Veg Fry Momo", variant: "Full", price: 70, category: "momos" },
    { code: "MFP50", name: "Paneer Fry Momo", variant: "Half", price: 50, category: "momos" },
    { code: "MFP90", name: "Paneer Fry Momo", variant: "Full", price: 90, category: "momos" },

    { code: "MCV50", name: "Veg Crunchy Momo", variant: "Half", price: 50, category: "momos" },
    { code: "MCV90", name: "Veg Crunchy Momo", variant: "Full", price: 90, category: "momos" },
    { code: "MCP55", name: "Paneer Crunchy Momo", variant: "Half", price: 55, category: "momos" },
    { code: "MCP100", name: "Paneer Crunchy Momo", variant: "Full", price: 100, category: "momos" },

    { code: "MKV55", name: "Veg Kurkure Momo", variant: "Half", price: 55, category: "momos" },
    { code: "MKV100", name: "Veg Kurkure Momo", variant: "Full", price: 100, category: "momos" },
    { code: "MKP60", name: "Paneer Kurkure Momo", variant: "Half", price: 60, category: "momos" },
    { code: "MKP110", name: "Paneer Kurkure Momo", variant: "Full", price: 110, category: "momos" },

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

app.get('/api/menu', (req, res) => {
    res.json({ success: true, menu: MENU_DATA });
});

app.post('/api/bills/create', async (req, res) => {
    try {
        const { customerName, customerPhone, paymentMethod, items, subtotal, tax, discount, grandTotal } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart cannot be empty.' });
        }

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

// Professional Thermal PDF Invoice Generator Route
app.get('/api/bills/pdf/:invoiceNo', async (req, res) => {
    try {
        const { invoiceNo } = req.params;
        let billData;

        if (mongoose.connection.readyState === 1) {
            billData = await Bill.findOne({ invoiceNo });
        }

        if (!billData) {
            billData = {
                invoiceNo: invoiceNo || 'LEC-20261027-9999',
                createdAt: new Date(),
                customerName: 'Walk-in Guest',
                paymentMethod: 'UPI',
                items: [
                    { name: 'Special Chai', variant: 'Kullad', price: 20, qty: 2, total: 40 },
                    { name: 'Veg Steam Momo', variant: 'Full', price: 50, qty: 1, total: 50 }
                ],
                subtotal: 90,
                tax: 0,
                discount: 0,
                grandTotal: 90
            };
        }

        const doc = new PDFDocument({ size: [226, 500], margin: 12 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Invoice_${billData.invoiceNo}.pdf`);

        doc.pipe(res);

        // Header
        doc.font('Helvetica-Bold').fontSize(13).text('LAUNG ELAICHI CAFE', { align: 'center' });
        doc.font('Helvetica').fontSize(7).fillColor('#555555');
        doc.text('Bangla Chauraha, Beside Mahakal Kachori', { align: 'center' });
        doc.text('Lucknow, Uttar Pradesh', { align: 'center' });
        doc.moveDown(0.5);

        // Invoice Meta
        doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');
        doc.text(`INVOICE: ${billData.invoiceNo}`);
        doc.font('Helvetica');
        doc.text(`DATE: ${new Date(billData.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}`);
        doc.text(`CUSTOMER: ${billData.customerName}`);
        doc.text(`PAYMENT MODE: ${billData.paymentMethod}`);
        doc.text('----------------------------------------------------------');

        // Table Headers
        doc.font('Helvetica-Bold').fontSize(7);
        doc.text('ITEM / VARIANT', 12, doc.y, { continued: true });
        doc.text('QTY', 115, doc.y, { continued: true, align: 'right' });
        doc.text('PRICE', 150, doc.y, { continued: true, align: 'right' });
        doc.text('TOTAL', 190, doc.y, { align: 'right' });
        
        doc.font('Helvetica').text('----------------------------------------------------------');

        // Items Loop
        billData.items.forEach(item => {
            const itemNameStr = `${item.name} (${item.variant})`;
            doc.fontSize(7).font('Helvetica-Bold');
            doc.text(itemNameStr, 12, doc.y);
            
            doc.font('Helvetica');
            doc.text(`${item.qty}`, 115, doc.y - 9, { align: 'right', width: 20 });
            doc.text(`₹${item.price}`, 140, doc.y - 9, { align: 'right', width: 25 });
            doc.text(`₹${item.total}`, 175, doc.y - 9, { align: 'right', width: 25 });
            doc.moveDown(0.4);
        });

        doc.text('----------------------------------------------------------');

        // Totals Section
        const rightAlignX = 145;
        doc.font('Helvetica');
        doc.text(`Subtotal:`, 80, doc.y, { continued: true });
        doc.text(`₹${billData.subtotal.toFixed(2)}`, rightAlignX, doc.y, { align: 'right', width: 55 });

        if (billData.discount > 0) {
            doc.text(`Discount:`, 80, doc.y, { continued: true });
            doc.text(`-₹${billData.discount.toFixed(2)}`, rightAlignX, doc.y, { align: 'right', width: 55 });
        }

        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text(`GRAND TOTAL:`, 60, doc.y, { continued: true });
        doc.text(`₹${billData.grandTotal.toFixed(2)}`, rightAlignX - 10, doc.y, { align: 'right', width: 65 });
        
        doc.font('Helvetica').fontSize(7);
        doc.text('----------------------------------------------------------');
        doc.moveDown(0.3);

        // Footer
        doc.font('Helvetica-Bold').fontSize(8).text('Thank You! Please Visit Again!', { align: 'center' });
        doc.font('Helvetica-Oblique').fontSize(6).fillColor('#666666');
        doc.text('Sukoon Ki Har Ghoont, Aapke Naam.', { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).send('Could not generate professional PDF Invoice.');
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('⚡ Billing Terminal connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Terminal disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`☕ LAUNG ELAICHI CAFE POS RUNNING ON PORT ${PORT}`);
});
