const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Supabase Cloud Configuration
const supabaseUrl = 'https://zzqdvwrmduhxgpbwigwl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6cWR2d3JtZHVoeGdwYndpZ3dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Njc5OTAsImV4cCI6MjEwNzQ0Mzk5MH0.zV-MTHrcJHUwWBZIK3mgEkiEf8_0C4jEsCuCnw5zqKQ';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());
// Explicitly serve the frontend for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ================= PRODUCT ROUTES =================

// 1. Get all products
app.get('/api/products', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Add new product
app.post('/api/products', async (req, res) => {
  try {
    const { barcode, name, category, cost_price, selling_price, stock_quantity, reorder_level } = req.body;
    
    // FIX: If the barcode is left blank, auto-generate a unique one (e.g., SKU-1701234567890)
    const finalBarcode = (barcode && barcode.trim() !== '') ? barcode : 'SKU-' + Date.now();

    const { data, error } = await supabase
      .from('products')
      .insert([{
        barcode: finalBarcode,
        name,
        category,
        cost_price: Number(cost_price) || 0,
        selling_price: Number(selling_price) || 0,
        stock_quantity: Number(stock_quantity) || 0,
        reorder_level: Number(reorder_level) || 5
      }])
      .select();

    if (error) throw error; // If it's a real duplicate, it will still safely reject it
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update existing product
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('products')
      .update(req.body)
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SALES & REPORT ROUTES =================

// 5. Record checkout / complete sale
app.post('/api/checkout', async (req, res) => {
  try {
    const { items, subtotal, discount, total, payment_method } = req.body;
    const receipt_no = 'TXN-' + Date.now();
    let totalProfit = 0;

    // A. Process Items: Deduct stock AND calculate exact profit
    if (items && items.length > 0) {
      for (const item of items) {
        const prodId = item.id || item.product_id;
        const qtyBought = item.qty || item.quantity;
        const sellPrice = item.price || item.selling_price || item.unit_price || 0;

        if (prodId) {
          // Fetch the current stock and true cost_price from the database
          const { data: prod } = await supabase
            .from('products')
            .select('stock_quantity, cost_price')
            .eq('id', prodId)
            .single();

          if (prod) {
            // Calculate math: (Selling Price - Cost Price) * Quantity
            const costPrice = Number(prod.cost_price) || 0;
            totalProfit += (sellPrice - costPrice) * qtyBought;

            // Deduct stock
            const updatedStock = Math.max(0, (prod.stock_quantity || 0) - qtyBought);
            await supabase
              .from('products')
              .update({ stock_quantity: updatedStock })
              .eq('id', prodId);
          }
        }
      }
    }

    // Adjust total profit if you applied a discount to the cart
    totalProfit = totalProfit - (Number(discount) || 0);

    // B. Record sale with the actual calculated profit
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert([{
        receipt_no,
        payment_method: payment_method || 'CASH',
        subtotal: Number(subtotal) || 0,
        discount: Number(discount) || 0,
        total: Number(total) || 0,
        profit: totalProfit,
        status: 'COMPLETED'
      }])
      .select();

    if (saleError) throw saleError;
    const createdSale = saleData[0];

    // C. Save the receipt items
    if (items && items.length > 0) {
      const saleItemsToInsert = items.map(item => ({
        sale_id: createdSale.id,
        product_id: item.id || item.product_id || item.barcode, 
        quantity: item.qty || item.quantity,
        unit_price: item.price || item.selling_price || item.unit_price || 0,
        subtotal: (item.qty || item.quantity) * (item.price || item.selling_price || item.unit_price || 0)
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItemsToInsert);

      if (itemsError) throw itemsError;
    }

    res.json({ success: true, sale: createdSale });
  } catch (err) {
    console.error("Checkout Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. Get all sales (Reports & Z-reading)
app.get('/api/sales', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(name))')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SECURITY ROUTES =================

// Helper function to ensure the settings table and default PIN exist
async function ensureSettingsTable() {
  try {
    // Check if row 1 exists
    const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (!data) {
      await supabase.from('settings').insert([{ id: 1, pin_code: '1234' }]);
    }
  } catch (e) {
    // Table might not exist yet; handle silently or let database init handle it
  }
}

// 1. Verify PIN from Supabase
app.post('/api/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    await ensureSettingsTable();
    
    // Fetch the PIN from the database
    const { data, error } = await supabase
      .from('settings')
      .select('pin_code')
      .eq('id', 1)
      .single();

    // Fallback default if table is completely uninitialized
    const currentPin = data ? data.pin_code : '1234';

    if (currentPin === pin) {
      res.status(200).json({ success: true });
    } else {
      res.status(401).json({ error: 'Incorrect PIN' });
    }
  } catch (err) {
    // Fallback fallback so it NEVER throws a 500 error if DB is down
    if (pin === '1234') {
      return res.status(200).json({ success: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// 2. Update PIN permanently in Supabase
app.put('/api/settings/pin', async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    await ensureSettingsTable();
    
    // Check if current PIN matches the database
    const { data: currentData } = await supabase
      .from('settings')
      .select('pin_code')
      .eq('id', 1)
      .single();
      
    const storedPin = currentData ? currentData.pin_code : '1234';

    if (storedPin !== currentPin) {
      return res.status(401).json({ error: 'Current PIN is incorrect.' });
    }
    
    // Save the new PIN permanently in Supabase
    const { error: updateError } = await supabase
      .from('settings')
      .upsert([{ id: 1, pin_code: newPin }]);
      
    if (updateError) throw updateError;
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server (Supports both cloud environments and local testing)
// Keep local testing working, but export for Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;