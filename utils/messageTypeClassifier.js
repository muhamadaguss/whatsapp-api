class MessageTypeClassifier {
  constructor() {
    this.categories = {
      Promo: {
        keywords: [
          "promo",
          "diskon",
          "potongan",
          "cashback",
          "gratis",
          "free",
          "murah",
          "hemat",
          "sale",
          "obral",
          "flash sale",
          "mega sale",
          "spesial",
          "khusus",
          "terbatas",
          "limited",
          "offer",
          "penawaran",
          "bonus",
          "hadiah",
          "voucher",
          "kupon",
          "cicilan",
          "dp",
          "discount",
          "promotion",
          "special offer",
          "deal",
          "bargain",
          "clearance",
          "hot deal",
          "best price",
          "lowest price",
        ],
        patterns: [
          /\b\d+%\s*(off|diskon|potongan)/i,
          /\brp\s*\d+/i,
          /\$\d+/i,
          /\bharga\s*(khusus|spesial|promo)/i,
          /\bbuy\s*\d+\s*get\s*\d+/i,
          /\bbeli\s*\d+\s*gratis\s*\d+/i,
        ],
      },
      Updates: {
        keywords: [
          "update",
          "pembaruan",
          "info",
          "informasi",
          "pengumuman",
          "berita",
          "news",
          "terbaru",
          "baru",
          "fitur baru",
          "versi",
          "maintenance",
          "perbaikan",
          "sistem",
          "aplikasi",
          "website",
          "layanan",
          "status",
          "gangguan",
          "downtime",
          "announcement",
          "notification",
          "alert",
          "notice",
          "bulletin",
          "release",
          "launch",
          "new feature",
          "upgrade",
          "patch",
        ],
        patterns: [
          /\bv\d+\.\d+/i, 
          /\bversi\s*\d+/i,
          /\bupdate\s*(terbaru|baru)/i,
          /\bnew\s*(feature|update|version)/i,
        ],
      },
      Reminder: {
        keywords: [
          "reminder",
          "pengingat",
          "ingat",
          "jangan lupa",
          "deadline",
          "batas waktu",
          "expired",
          "kadaluarsa",
          "berakhir",
          "habis",
          "pembayaran",
          "tagihan",
          "invoice",
          "jatuh tempo",
          "due date",
          "segera",
          "urgent",
          "penting",
          "harap",
          "mohon",
          "diminta",
          "remember",
          "dont forget",
          "expiry",
          "expires",
          "payment due",
          "overdue",
          "urgent",
          "important",
          "please",
          "kindly",
        ],
        patterns: [
          /\b\d+\s*(hari|days?|jam|hours?)\s*(lagi|left|remaining)/i,
          /\bdeadline\s*\d+/i,
          /\bjatuh\s*tempo/i,
          /\bdue\s*(date|today|tomorrow)/i,
          /\bexpir(es?|y|ed)\s*(on|dalam|in)/i,
        ],
      },
      Welcome: {
        keywords: [
          "welcome",
          "selamat datang",
          "halo",
          "hai",
          "hello",
          "hi",
          "terima kasih",
          "thank you",
          "thanks",
          "bergabung",
          "join",
          "member baru",
          "new member",
          "registrasi",
          "daftar",
          "sign up",
          "aktivasi",
          "verifikasi",
          "konfirmasi",
          "onboarding",
          "greetings",
          "congratulations",
          "welcome aboard",
          "getting started",
          "first time",
          "new user",
          "account created",
          "registration",
        ],
        patterns: [
          /\bselamat\s*(datang|bergabung)/i,
          /\bwelcome\s*(to|aboard)/i,
          /\bhalo\s*[a-zA-Z]/i,
          /\bterima\s*kasih\s*(telah|sudah|atas)/i,
          /\bthank\s*you\s*for/i,
        ],
      },
      Support: {
        keywords: [
          "bantuan",
          "help",
          "support",
          "customer service",
          "cs",
          "pertanyaan",
          "question",
          "masalah",
          "problem",
          "issue",
          "keluhan",
          "complaint",
          "laporan",
          "report",
          "error",
          "troubleshoot",
          "solusi",
          "solution",
          "panduan",
          "guide",
          "tutorial",
          "cara",
          "how to",
          "faq",
          "hubungi",
          "contact",
          "assistance",
          "technical support",
          "helpdesk",
          "inquiry",
          "feedback",
          "bug report",
          "feature request",
          "documentation",
        ],
        patterns: [
          /\bbagaimana\s*(cara|untuk)/i,
          /\bhow\s*(to|do|can)/i,
          /\bapa\s*(itu|yang)/i,
          /\bwhat\s*(is|are)/i,
          /\berror\s*(code|message)/i,
        ],
      },
    };
  }
  classify(messageContent) {
    if (!messageContent || typeof messageContent !== "string") {
      return "Support"; 
    }
    const content = messageContent.toLowerCase().trim();
    const scores = {};
    Object.entries(this.categories).forEach(([category, config]) => {
      scores[category] = this.calculateScore(content, config);
    });
    const bestMatch = Object.entries(scores).reduce(
      (best, [category, score]) => {
        return score > best.score ? { category, score } : best;
      },
      { category: "Support", score: 0 }
    );
    return bestMatch.score > 0 ? bestMatch.category : "Support";
  }
  calculateScore(content, config) {
    let score = 0;
    config.keywords.forEach((keyword) => {
      if (content.includes(keyword.toLowerCase())) {
        score += keyword.length > 5 ? 2 : 1;
      }
    });
    config.patterns.forEach((pattern) => {
      if (pattern.test(content)) {
        score += 3; 
      }
    });
    return score;
  }
  classifyWithDetails(messageContent) {
    if (!messageContent || typeof messageContent !== "string") {
      return {
        category: "Support",
        confidence: 0,
        matchedKeywords: [],
        matchedPatterns: [],
      };
    }
    const content = messageContent.toLowerCase().trim();
    const results = {};
    Object.entries(this.categories).forEach(([category, config]) => {
      const matchedKeywords = config.keywords.filter((keyword) =>
        content.includes(keyword.toLowerCase())
      );
      const matchedPatterns = config.patterns.filter((pattern) =>
        pattern.test(content)
      );
      const score = this.calculateScore(content, config);
      results[category] = {
        score,
        matchedKeywords,
        matchedPatterns,
      };
    });
    const bestMatch = Object.entries(results).reduce(
      (best, [category, data]) => {
        return data.score > best.score ? { category, ...data } : best;
      },
      {
        category: "Support",
        score: 0,
        matchedKeywords: [],
        matchedPatterns: [],
      }
    );
    const totalScore = Object.values(results).reduce(
      (sum, data) => sum + data.score,
      0
    );
    const confidence =
      totalScore > 0 ? Math.round((bestMatch.score / totalScore) * 100) : 0;
    return {
      category: bestMatch.category,
      confidence,
      matchedKeywords: bestMatch.matchedKeywords,
      matchedPatterns: bestMatch.matchedPatterns.map((p) => p.toString()),
      allScores: results,
    };
  }
  addKeywords(category, keywords) {
    if (!this.categories[category]) {
      throw new Error(`Category '${category}' not found`);
    }
    const keywordsArray = Array.isArray(keywords) ? keywords : [keywords];
    this.categories[category].keywords.push(...keywordsArray);
  }
  addPatterns(category, patterns) {
    if (!this.categories[category]) {
      throw new Error(`Category '${category}' not found`);
    }
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    this.categories[category].patterns.push(...patternsArray);
  }
}
module.exports = MessageTypeClassifier;
