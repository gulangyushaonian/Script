let obj = {
  "msg" : "success",
  "data" : [
    {
      "due_time" : "2099-12-31 23:59:59",
      "vip_type" : "one_year_vip",
             
      "now_time" : "2025-11-03 15:31:51",
      "isExpire" : false,
      "isExist" : true,
      "in_app" : "[{\"quantity\": \"1\", \"product_id\": \"vip_1_year_auto\", \"transaction_id\": \"490002443854569\", \"original_transaction_id\": \"490002443854569\", \"purchase_date\": \"2025-11-03 07:31:40 Etc/GMT\", \"purchase_date_ms\": \"1762155100000\", \"purchase_date_pst\": \"2025-11-02 23:31:40 America/Los_Angeles\", \"original_purchase_date\": \"2025-11-03 07:31:41 Etc/GMT\", \"original_purchase_date_ms\": \"1762155101000\", \"original_purchase_date_pst\": \"2025-11-02 23:31:41 America/Los_Angeles\", \"expires_date\": \"2099-12-31 23:59:59 Etc/GMT\", \"expires_date_ms\": \"4102444799000\", \"expires_date_pst\": \"2099-12-31 15:59:59 America/Los_Angeles\", \"web_order_line_item_id\": \"490001129186763\", \"is_trial_period\": \"true\", \"is_in_intro_offer_period\": \"true\", \"in_app_ownership_type\": \"PURCHASED\"}]"
    }
  ],
  "code" : 1
};

$done({body: JSON.stringify(obj)});
