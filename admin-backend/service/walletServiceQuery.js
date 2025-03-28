const { ObjectId } = require("bson")
module.exports = {
  getwalletAllTransactionRequestQuery: function (params) {
    const { user_id, limit, page, fullSearch, partialSearch, sort, from_date, to_date, lowestAmount, highestAmount, status } = params.joiData;
    let partialSearchObj = {};
    for (key in partialSearch) {
      let partialSearchRegex = {};
      partialSearchRegex.$regex = String(partialSearch[key]);
      partialSearchRegex.$options = 'i';
      partialSearchObj[key] = partialSearchRegex;
    }
    if (fullSearch?.mobile) {
      fullSearch.mobile = parseInt(fullSearch.mobile)
    }
    let matchConditions = {
      "$match": { walletagents: ObjectId(user_id), status: { $ne: 'PENDING' }, ...partialSearchObj, ...fullSearch }
    }
    if (params.path == '/getwalletDWTransactionList') {
      delete matchConditions.status;
      if (status != 'ALL') {
        matchConditions["$match"]["status"] = status;
      } else {
        matchConditions["$match"]["status"] = { $in: ["PENDING", "ACCEPTED", "REJECTED", "PROGRESS"] };
      }
    }

    if (from_date && to_date) {
      matchConditions["$match"]["created_at"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    }
    if (lowestAmount && highestAmount) {
      matchConditions["$match"]["amount"] = { '$gte': lowestAmount, '$lte': highestAmount };
    } else if (!lowestAmount && highestAmount) {
      matchConditions["$match"]["amount"] = { '$lte': highestAmount };
    } else if (lowestAmount && !highestAmount) {
      matchConditions["$match"]["amount"] = { '$gte': lowestAmount };
    }
    let sortConditions = {
      $sort: sort === undefined || Object.keys(sort).length === 0 ? { created_at: -1 } : { ...sort }
    };
    let projectConditions = {
      $project: { status: 1, name: 1, created_at: 1, generated_at: 1, updatedAt: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1, statement_type: 1, reference_no: 1, user_reference_no: 1, self_host: 1, user_name: 1, mobile: 1, remark: 1, country_code: 1, user_id: 1, payment_deatails: 1 }
    };
    let skip = (page - 1) * limit;
    return [
      {
        ...matchConditions
      },
      {
        ...projectConditions
      },
      {
        '$facet': {
          "metadata": [
            { "$count": "total" }, { '$addFields': { "page": page } }
          ],
          "data": [
            {
              ...sortConditions
            },
            { "$skip": skip },
            { "$limit": limit }
          ],
          "amountSum": [
            {
              $group: { _id: null, "totalAmount": { $sum: { $sum: "$amount" } } }
            }
          ],
          "depositAmount": [
            {
              $match: { statement_type: "DEPOSIT_REQUEST" }

            },
            {
              $group: { _id: null, "totalAmount": { $sum: { $sum: "$amount" } } }
            }
          ],
          "withdrawAmount": [
            {
              $match: { statement_type: "WITHDRAW_REQUEST" }
            },
            {
              $group: { _id: null, "totalAmount": { $sum: { $sum: "$amount" } } }
            }
          ]
        }
      }
    ]
  },
  getAllTransactionsListRequestQuery: function (params) {
    const { page, limit, status, statement_type, user_id, from_date, to_date, search } = params;
    let skip = (page - 1) * limit;
    // Construct filter
    let filter = { 'parents.user_id': user_id };
    // Handle status filtering
    if (status !== 'ALL') {
      filter.status = status;
    } else {
      filter.status = { $in: ["PENDING", "ACCEPTED", "REJECTED", "PROGRESS"] };
    }
    // Handle statement_type filtering
    if (statement_type !== 'ALL')
      filter.statement_type = statement_type;

    // Handle date filtering
    if (from_date && to_date) {
      filter.created_at = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    }

    if (search) {
      if (search.constructor.name === "Object") {
        Object.assign(filter, search);
      }
    }

    return [
      { $match: filter },
      { $sort: { created_at: -1 } },
      {
        $facet: {
          transactionData: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                name: 1,
                parent_user_name: 1,
                domain_name: 1,
                amount: 1,
                payment_details: 1,
                generated_at: 1,
                created_at: 1,
                user_name: 1,
                mobile: 1,
                user_id: 1,
                parent_id: 1,
                status: 1,
                updatedAt: 1,
                remark: 1,
                statement_type: 1
              }
            }
          ],
          totalAmount: [
            {
              $group: {
                _id: null,
                totalWithdrawal: {
                  $sum: {
                    $cond: [
                      { $eq: ["$statement_type", "WITHDRAW_REQUEST"] },
                      "$amount",
                      0
                    ]
                  }
                },
                totalDeposit: {
                  $sum: {
                    $cond: [
                      { $eq: ["$statement_type", "DEPOSIT_REQUEST"] },
                      "$amount",
                      0
                    ]
                  }
                }
              }
            }
          ],
          totalCount: [{ $count: "count" }]
        }
      },
      // Format the response to include pagination info
      {
        $project: {
          data: "$transactionData",
          totalWithdrawal: { $arrayElemAt: ["$totalAmount.totalWithdrawal", 0] },
          totalDeposit: { $arrayElemAt: ["$totalAmount.totalDeposit", 0] },
          total: { $arrayElemAt: ["$totalCount.count", 0] },
          limit: { $literal: limit }, // Include limit
          page: { $literal: page }    // Include page
        }
      }
    ];
  }
}
