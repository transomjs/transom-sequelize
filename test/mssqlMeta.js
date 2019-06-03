const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = {
		orderSkuId: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			autoIncrement: true,
			comment: null,
			autoIncrement: true,
			field: 'order_sku_id'
		},
		orderId: {
			type: DataTypes.INTEGER,
			allowNull: false,
			comment: null,
			references: {
				model: 'INV_order',
				key: 'order_id'
			},
			field: 'order_id'
		},
		skuId: {
			type: DataTypes.INTEGER,
			allowNull: false,
			comment: null,
			references: {
				model: 'INV_SKU',
				key: 'sku_id'
			},
			field: 'sku_id'
		},
		price: {
			type: DataTypes.DOUBLE,
			allowNull: false,
			comment: null,
			field: 'price'
		},
		qty: {
			type: DataTypes.INTEGER,
			allowNull: false,
			comment: null,
			field: 'qty'
		},
		active: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			comment: null,
			field: 'active'
		},
		createdDate: {
			type: DataTypes.DATE,
			allowNull: true,
			comment: null,
			field: 'created_date'
		},
		createdBy: {
			type: DataTypes.STRING(255),
			allowNull: true,
			comment: null,
			unicode: false,
			field: 'created_by'
		},
		updatedDate: {
            type: DataTypes.DATE,
            queryable: false,
			allowNull: true,
			comment: null,
			field: 'updated_date'
		},
		updatedBy: {
			type: DataTypes.STRING(255),
			allowNull: true,
			comment: null,
			unicode: true, // <-- Note: This is different from CreatedBy!!
			field: 'updated_by'
		}}; // End of metadata
