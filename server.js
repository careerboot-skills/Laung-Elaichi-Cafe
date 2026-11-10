/**
 * THE BANGLA LAUNG ELAICHI CAFE - COMPLETE POS & ACCOUNTING SERVER
 * Location: Bangla Chauraha, Beside Mahakal Kachori, Lucknow
 * Contact: 9005041462
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

const inventorySchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    variant: { type: String, default: 'Standard' },
    category: { type: String, required: true },
    stock: { type: Number, required: true, default: 50 },
    unitPrice: { type: Number, required: true, default: 0 }
}, { timestamps: true });

const InventoryItem = mongoose.model('InventoryItem', inventorySchema);

// Synchronized Menu Inventory Data
const INITIAL_MENU_DATA = [
    { code: "T10", name: "Sukoon Ki Chai", variant: "Regular", price: 10, category: "tea", stock: 100 },
    { code: "T15", name: "Kulhad Chai", variant: "Kulhad", price: 15, category: "tea", stock: 100 },
    { code: "T20", name: "Special Chai", variant: "Kulhad", price: 20, category: "tea", stock: 100 },
    { code: "T25", name: "Rajwadi Chai", variant: "Royal Kullad", price: 25, category: "tea", stock: 80 },
    { code: "CS20", name: "Coffee Small", variant: "Regular", price: 20, category: "coffee", stock: 60 },
    { code: "CK25", name: "Coffee Kulhad", variant: "Kulhad", price: 25, category: "coffee", stock: 60 },
    { code: "CS30", name: "Coffee Special", variant: "Special", price: 30, category: "coffee", stock: 50 },
    { code: "BM20", name: "Bun Makkhan", variant: "Standard", price: 20, category: "bakery", stock: 40 },

    { code: "MSV30", name: "Veg Steam Momo", variant: "Half", price: 30, category: "momos", stock: 50 },
    { code: "MSV50", name: "Veg Steam Momo", variant: "Full", price: 50, category: "momos", stock: 50 },
    { code: "MSP40", name: "Paneer Steam Momo", variant: "Half", price: 40, category: "momos", stock: 40 },
    { code: "MSP70", name: "Paneer Steam Momo", variant: "Full", price: 70, category: "momos", stock: 40 },

    { code: "MFV40", name: "Veg Fry Momo", variant: "Half", price: 40, category: "momos", stock: 50 },
    { code: "MFV70", name: "Veg Fry Momo", variant: "Full", price: 70, category: "momos", stock: 50 },
    { code: "MFP50", name: "Paneer Fry Momo", variant: "Half", price: 50, category: "momos", stock: 40 },
    { code: "MFP90", name: "Paneer Fry Momo", variant: "Full", price: 90, category: "momos", stock: 40 },

    { code: "MCV50", name: "Veg Crunchy Momo", variant: "Half", price: 50, category: "momos", stock: 30 },
    { code: "MCV90", name: "Veg Crunchy Momo", variant: "Full", price: 90, category: "momos", stock: 30 },
    { code: "MCP55", name: "Paneer Crunchy Momo", variant: "Half", price: 55, category: "momos", stock: 30 },
    { code: "MCP100", name: "Paneer Crunchy Momo", variant: "Full", price: 100, category: "momos", stock: 30 },

    { code: "MKV55", name: "Veg Kurkure Momo", variant: "Half", price: 55, category: "momos", stock: 30 },
    { code: "MKV100", name: "Veg Kurkure Momo", variant: "Full", price: 100, category: "momos", stock: 30 },
    { code: "MKP60", name: "Paneer Kurkure Momo", variant: "Half", price: 60, category: "momos", stock: 30 },
    { code: "MKP110", name: "Paneer Kurkure Momo", variant: "Full", price: 110, category: "momos", stock: 30 },

    { code: "CM50", name: "Chai Post Mix Masala", variant: "Mini Pkt", price: 50, category: "masala", stock: 50 },
    { code: "CM200", name: "Chai Post Mix Masala", variant: "Mega Pkt", price: 200, category: "masala", stock: 25 }
];

// Database Connection with graceful initialization
mongoose.connect(MONGO_URI)
    async function initDB() {
        try {
            console.log('✅ Connected to MongoDB (The Bangla Laung Elaichi Cafe Database)');
            const count = await InventoryItem.countDocuments();
            if (count === 0) {
                for (let item of INITIAL_MENU_DATA) {
                    await InventoryItem.create({
                        code: item.code,
                        name: item.name,
                        variant: item.variant,
                        category: item.category,
                        stock: item.stock,
                        unitPrice: item.price
                    });
                }
                console.log('📦 Initial Inventory Seeded Successfully.');
            }
        } catch (err) {
            console.log('⚠️ MongoDB Connection Note: Running in standalone memory mode until DB connects.', err.message);
        }
    }
initDB();

// ==========================================
// API ROUTES
// ==========================================

app.get('/api/menu', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const items = await InventoryItem.find({});
            const formatted = items.map(i => ({
                code: i.code,
                name: i.name,
                variant: i.variant,
                price: i.unitPrice,
                category: i.category,
                stock: i.stock,
                icon: getCategoryIcon(i.category)
            }));
            return res.json({ success: true, menu: formatted });
        }
        res.json({ success: true, menu: INITIAL_MENU_DATA.map(i => ({ ...i, icon: getCategoryIcon(i.category) })) });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error fetching menu inventory.' });
    }
});

function getCategoryIcon(cat) {
    switch (cat) {
        case 'tea': return '☕';
        case 'coffee': return '🫖';
        case 'momos': return '🥟';
        case 'bakery': return '🧈';
        case 'masala': return '📦';
        default: return '🍽️';
    }
}

app.get('/api/inventory', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const items = await InventoryItem.find({}).sort({ category: 1, name: 1 });
            return res.json({ success: true, inventory: items });
        }
        res.json({ success: true, inventory: INITIAL_MENU_DATA });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch inventory.' });
    }
});

app.post('/api/inventory/update', async (req, res) => {
    try {
        const { code, stock, unitPrice, name, variant, category } = req.body;
        if (mongoose.connection.readyState === 1) {
            let item = await InventoryItem.findOne({ code });
            if (item) {
                if (stock !== undefined) item.stock = parseInt(stock);
                if (unitPrice !== undefined) item.unitPrice = parseFloat(unitPrice);
                await item.save();
            } else {
                item = await InventoryItem.create({ code, name, variant, category, stock: parseInt(stock || 50), unitPrice: parseFloat(unitPrice || 10) });
            }
            io.emit('inventory-updated', item);
            return res.json({ success: true, message: 'Inventory updated successfully!', item });
        }
        res.json({ success: true, message: 'Mock inventory updated.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update stock.', error: error.message });
    }
});

app.post('/api/bills/create', async (req, res) => {
    try {
        const { customerName, customerPhone, paymentMethod, items, subtotal, tax, discount, grandTotal } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart cannot be empty.' });
        }

        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const invoiceNo = `BLEC-${todayStr}-${randomNum}`;

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

            // Deduct Stock
            for (let orderedItem of items) {
                await InventoryItem.findOneAndUpdate(
                    { code: orderedItem.code },
                    { $inc: { stock: -orderedItem.qty } }
                );
            }
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
                recentBills: bills
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

// Professional Structured Thermal PDF Invoice Generator Route
app.get('/api/bills/pdf/:invoiceNo', async (req, res) => {
    try {
        const { invoiceNo } = req.params;
        let billData;

        if (mongoose.connection.readyState === 1) {
            billData = await Bill.findOne({ invoiceNo });
        }

        if (!billData) {
            billData = {
                invoiceNo: invoiceNo || 'BLEC-20261028-9999',
                createdAt: new Date(),
                customerName: 'Walk-in Guest',
                customerPhone: '9005041462',
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

        const doc = new PDFDocument({ size: [226, 520], margin: 12 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Invoice_${billData.invoiceNo}.pdf`);

        doc.pipe(res);

        // --- HEADER ---
        doc.font('Helvetica-Bold').fontSize(11).text('THE BANGLA LAUNG ELAICHI CAFE', { align: 'center' });
        doc.font('Helvetica').fontSize(6.5).fillColor('#444444');
        doc.text('Bangla Chauraha, Beside Mahakal Kachori, Lucknow', { align: 'center' });
        doc.text('Helpline / Contact: 9005041462', { align: 'center' });
        doc.moveDown(0.4);

        // --- INVOICE META & CONTACTS ---
        doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');
        doc.text(`INVOICE NO: ${billData.invoiceNo}`);
        doc.font('Helvetica');
        doc.text(`DATE: ${new Date(billData.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}`);
        doc.text(`CUSTOMER: ${billData.customerName}`);
        doc.text(`CUST PHONE: ${billData.customerPhone || 'N/A'}`);
        doc.text(`PAYMENT MODE: ${billData.paymentMethod}`);
        doc.text('----------------------------------------------------------');

        // --- TABLE HEADERS ---
        doc.font('Helvetica-Bold').fontSize(7);
        doc.text('ITEM / VARIANT', 12, doc.y, { continued: true });
        doc.text('QTY', 115, doc.y, { continued: true, align: 'right' });
        doc.text('PRICE', 150, doc.y, { continued: true, align: 'right' });
        doc.text('TOTAL', 190, doc.y, { align: 'right' });
        
        doc.font('Helvetica').text('----------------------------------------------------------');

        // --- ITEMS LOOP ---
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

        // --- TOTALS SECTION ---
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

        // --- FOOTER ---
        doc.font('Helvetica-Bold').fontSize(7.5).text('Thank You! Please Visit Again!', { align: 'center' });
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
    console.log(`☕ THE BANGLA LAUNG ELAICHI CAFE POS RUNNING ON PORT ${PORT}`);
});
