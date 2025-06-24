const XLSX = require('xlsx');

const downloadTemplate = (req, res) => {
    // 1. Buat workbook baru
    const workbook = XLSX.utils.book_new();
    
    // 2. Isi data template
    const worksheetData = [
      ["no", "name"], // Header
      ["628123456789", "Agus"], // Contoh baris
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // 3. Tambahkan worksheet ke workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    // 4. Tulis workbook ke buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 5. Kirim response sebagai file download
    res.setHeader('Content-Disposition', 'attachment; filename="template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
}

module.exports = { downloadTemplate }