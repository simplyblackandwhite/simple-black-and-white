/**
 * The Compliant Caffeine Calculator
 * Simply Black and White — Phase 3
 *
 * A zero-API, array-randomizer-powered drink generator that stitches
 * together custom drink recipes and pairs them with compliance puns.
 * Fully keyboard-accessible and screen-reader-friendly.
 */
(function () {
  'use strict';

  // ─── Drink Data ──────────────────────────────────────────────
  var drinks = {
    coffee: {
      emoji: '☕',
      bases: [
        'Oat Milk Latte', 'Iced Americano', 'Caramel Cortado', 'Flat White',
        'Honey Cappuccino', 'Cold Brew', 'Vanilla Espresso', 'Mocha',
        'Affogato Shot', 'Dirty Chai Latte', 'Ristretto', 'Nitro Cold Brew',
        'Brown Sugar Shaken Espresso', 'Cinnamon Dolce Latte', 'Blonde Roast Pour-Over',
        'Toasted Vanilla Oat Latte', 'Pistachio Latte', 'Salted Caramel Cold Brew',
        'Lavender Oat Latte', 'Hazelnut Bianco'
      ],
      milks: [
        'oat milk', 'almond milk', 'whole milk', 'coconut milk', 'cashew milk',
        'soy milk', 'macadamia milk', '2% milk', 'heavy cream float',
        'sweet cream cold foam', 'vanilla oat creamer'
      ],
      sweetness: [
        'one pump vanilla', 'two pumps caramel', 'honey drizzle', 'brown sugar syrup',
        'maple sweetener', 'agave splash', 'unsweetened', 'light lavender syrup',
        'cinnamon dolce', 'toasted vanilla', 'hazelnut pump', 'toffee nut',
        'white mocha drizzle', 'raw sugar packet', 'chai spice syrup'
      ],
      toppings: [
        'cold foam on top', 'cinnamon dust', 'cocoa powder finish', 'caramel drizzle',
        'whipped cream', 'vanilla bean sprinkle', 'nothing extra — keep it clean',
        'oat milk foam art', 'espresso powder rim', 'sea salt flakes',
        'cookie crumble', 'nutmeg dash', 'chocolate shavings'
      ]
    },
    tea: {
      emoji: '🍵',
      bases: [
        'Iced Matcha Latte', 'London Fog', 'Chai Concentrate', 'Jasmine Green Tea',
        'Lavender Earl Grey', 'Hojicha Latte', 'Mint Green Iced Tea',
        'Golden Turmeric Latte', 'Rooibos Vanilla', 'Genmaicha',
        'Butterfly Pea Flower Iced Tea', 'Moroccan Mint', 'Oolong Milk Tea',
        'White Peach Tea', 'Rose Cardamom Chai', 'Vanilla Rooibos Latte',
        'Yerba Mate Energizer', 'Hibiscus Berry Blend', 'Sencha Shot', 'Thai Iced Tea'
      ],
      milks: [
        'oat milk', 'coconut milk', 'almond milk', 'whole milk', 'hemp milk',
        'no milk — straight up', 'cashew milk', 'condensed milk splash',
        'vanilla soy', 'barista oat blend', 'macadamia cream'
      ],
      sweetness: [
        'honey stir', 'agave nectar', 'vanilla syrup', 'raw sugar',
        'unsweetened', 'brown sugar boba syrup', 'date syrup', 'maple drizzle',
        'rose water sweetener', 'elderflower syrup', 'chai spice honey',
        'lychee syrup', 'peach nectar', 'ginger honey'
      ],
      toppings: [
        'boba pearls', 'matcha dust on top', 'fresh mint sprig', 'coconut whip',
        'lavender buds', 'nothing fancy — zen mode', 'lemon wheel', 'cinnamon stick',
        'crystal boba', 'taro foam', 'edible gold flake', 'dried rose petals',
        'toasted coconut flakes'
      ]
    },
    juice: {
      emoji: '🧃',
      bases: [
        'Mango Passionfruit Refresher', 'Strawberry Lemonade', 'Green Machine Juice',
        'Pineapple Coconut Cooler', 'Watermelon Agua Fresca', 'Berry Acai Blend',
        'Citrus Sunrise', 'Cucumber Mint Cooler', 'Peach Ginger Fizz',
        'Dragon Fruit Limeade', 'Tropical Guava Punch', 'Blood Orange Spritz',
        'Kiwi Coconut Water', 'Blueberry Lavender Lemonade', 'Mango Habanero Agua Fresca',
        'Prickly Pear Cooler', 'Honeydew Mint Freeze', 'Grapefruit Rosemary Tonic',
        'Papaya Lime Smoothie', 'Tart Cherry Recovery'
      ],
      milks: [
        'coconut water base', 'sparkling water', 'plain water', 'almond milk splash',
        'oat milk swirl', 'no mixer — full strength', 'lemonade base',
        'kombucha float', 'tonic water', 'ginger beer splash', 'cold-pressed apple base'
      ],
      sweetness: [
        'agave squeeze', 'honey drizzle', 'no added sugar', 'simple syrup splash',
        'stevia drop', 'raw cane sugar rim', 'maple touch', 'date paste blend',
        'elderflower cordial', 'vanilla bean paste', 'tamarind syrup',
        'passion fruit puree', 'monk fruit sweetener'
      ],
      toppings: [
        'chia seed float', 'fresh basil leaf', 'lime wedge', 'edible flower garnish',
        'crushed ice', 'mint sprig', 'nothing — let the fruit shine', 'coconut flakes',
        'hemp hearts', 'bee pollen sprinkle', 'tajin rim', 'candied ginger',
        'frozen fruit cubes'
      ]
    }
  };

  // ─── Compliance Puns ─────────────────────────────────────────
  var puns = [
    'Maximum flavor customization — just like clean semantic code structure.',
    'This drink has more layers than your homepage\'s heading hierarchy.',
    'Perfectly balanced sweetness-to-bold ratio. WCAG would approve.',
    'Every ingredient is labeled. Unlike most image alt tags out there.',
    'Custom toppings? That\'s progressive enhancement in a cup.',
    'This order flows better than a keyboard-navigable checkout page.',
    'Complex flavor, simple structure. The way code should be.',
    'Zero artificial barriers between you and your next sip.',
    'Accessible to every taste bud. No "div soup" here.',
    'Your drink order has better contrast than most website buttons.',
    'Layered flavors, logical hierarchy. Your h1 through h6 — in a cup.',
    'Every ingredient serves a purpose. No decorative-only elements.',
    'This recipe is more transparent than most cookie consent banners.',
    'Skip to content? More like skip to caffeine.',
    'Screen readers love this order. Clean labels, clear structure.',
    'Crafted with the same care as a properly nested ARIA landmark.',
    'No hidden ingredients. Unlike most third-party plugin injections.',
    'This drink meets AAA contrast requirements: bold, rich, and readable.',
    'Your order loaded faster than a site without render-blocking scripts.',
    'Every sip is inclusive. No one gets left behind at this counter.',
    'Tab through the flavors. Full keyboard support, naturally.',
    'Semantic from top to bottom — just like this drink layer by layer.',
    'Focus state: activated. Enjoyment mode: engaged.',
    'Built mobile-first: works just as well on the go.'
  ];

  // ─── Utility ─────────────────────────────────────────────────
  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function generateDrink(category) {
    var data = drinks[category];
    if (!data) return null;

    var base = randomFrom(data.bases);
    var milk = randomFrom(data.milks);
    var sweet = randomFrom(data.sweetness);
    var topping = randomFrom(data.toppings);
    var pun = randomFrom(puns);

    return {
      emoji: data.emoji,
      name: base,
      recipe: milk + ' · ' + sweet + ' · ' + topping,
      pun: pun
    };
  }

  // ─── DOM Bindings ────────────────────────────────────────────
  var generateBtn = document.getElementById('drink-generate');
  var regenerateBtn = document.getElementById('drink-regenerate');
  var saveBtn = document.getElementById('drink-save');
  var resultPanel = document.getElementById('drink-result');
  var emojiEl = document.getElementById('drink-emoji');
  var nameEl = document.getElementById('drink-name');
  var recipeEl = document.getElementById('drink-recipe');
  var punEl = document.getElementById('drink-pun');
  var lastDrink = null;

  function getSelectedCategory() {
    var checked = document.querySelector('input[name="drink-category"]:checked');
    return checked ? checked.value : 'coffee';
  }

  function renderDrink() {
    var category = getSelectedCategory();
    var drink = generateDrink(category);
    if (!drink) return;

    lastDrink = drink;
    emojiEl.textContent = drink.emoji;
    nameEl.textContent = drink.name;
    recipeEl.textContent = drink.recipe;
    punEl.textContent = '💬 "' + drink.pun + '"';

    // Show results
    resultPanel.hidden = false;

    // Move focus to the result for screen readers
    resultPanel.focus();
  }

  // ─── Event Listeners ─────────────────────────────────────────
  if (generateBtn) {
    generateBtn.addEventListener('click', renderDrink);
  }

  if (regenerateBtn) {
    regenerateBtn.addEventListener('click', renderDrink);
  }

  // Save My Brew — opens a branded print-ready card
  var saveBtn = document.getElementById('drink-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      if (!lastDrink) return;
      var w = window.open('', '_blank', 'width=400,height=600');
      if (!w) return;
      w.document.write(
        '<!DOCTYPE html><html><head><title>My Brew — Simply Black and White</title>' +
        '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;background:#1A1A1A;color:#F7F7F5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}' +
        '.card{text-align:center;max-width:320px;padding:40px 32px;border-radius:16px;border:2px solid #333}' +
        '.emoji{font-size:48px;margin-bottom:16px}h1{font-family:Georgia,serif;font-size:24px;margin-bottom:12px;font-weight:700}' +
        '.recipe{font-size:14px;color:#CBB9A6;margin-bottom:20px}hr{border:none;border-top:1px solid #333;margin:20px 0}' +
        '.pun{font-size:13px;font-style:italic;color:#999;margin-bottom:24px}' +
        '.brand{font-size:11px;color:#666;margin-top:24px}.brand strong{color:#aaa}' +
        '@media print{body{background:#fff;color:#1A1A1A}.card{border-color:#E5E5E5}.recipe{color:#1A1A1A}.pun{color:#555}.brand{color:#888}}</style></head><body>' +
        '<div class="card"><div class="emoji">' + lastDrink.emoji + '</div>' +
        '<h1>' + lastDrink.name + '</h1>' +
        '<p class="recipe">' + lastDrink.recipe + '</p><hr/>' +
        '<p class="pun">"' + lastDrink.pun + '"</p>' +
        '<p class="brand"><strong>Simply Black and White</strong><br/>simplyblackandwhite.com</p>' +
        '</div></body></html>'
      );
      w.document.close();
      setTimeout(function () { w.print(); }, 300);
    });
  }

  // Allow category change to auto-regenerate if result is already visible
  var categoryInputs = document.querySelectorAll('input[name="drink-category"]');
  categoryInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (!resultPanel.hidden) {
        renderDrink();
      }
    });
  });

})();
