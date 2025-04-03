module.exports = Object.freeze({
  market: {
    min_stack: 1,
    max_stack: 50000,
    max_stack_limits: { min: 0, max: 1000000 },
    min_odds_rate: 0.49,
    max_odds_rate: 100,
    bookmaker_min_odds_rate: 0.49,
    bookmaker_max_odds_rate: 100,
    bet_delay: 3,
    bet_delay_limits: { min: 0, max: 15 },
    max_profit: 2000000,
    max_profit_limit: 10000000,
    profit_range: 5,
    advance_bet_stake: 50000,
    advance_bet_stake_limits: { min: 0, max: 500000 },
    min_volume_limit: 0
  },

  session: {
    min_stack: 1,
    max_stack: 10000,
    max_stack_limits: { min: 0, max: 1000000 },
    bet_delay: 0,
    bet_delay_limits: { min: 0, max: 15 },
    max_profit: 1000000,
    max_profit_limit: 2500000,
    profit_range: 25,
    advance_bet_stake: 10000
  },

  user: {
    rate: { min: 0, max: 100, default: 0 },
    mobile: { min: 0, max: 15, default: null }
  },

  aura444: {
    credit_reference: { min: 0, max: 500000000, default: 0 }
  },

  b2c: {
    utr_value: { min: 12, max: 14 }
  }
});
