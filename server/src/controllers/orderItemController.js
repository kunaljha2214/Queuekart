const { validationResult } = require('express-validator');
const OrderItem = require('../models/OrderItem');
const Shop = require('../models/Shop');

async function list(req, res, next) {
  try {
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const items = await OrderItem.find({ shop: shop._id }).sort({
      sortOrder: 1,
      createdAt: 1,
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
}

async function listPublic(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const items = await OrderItem.find({ shop: shop._id, isAvailable: true }).sort({
      sortOrder: 1,
      createdAt: 1,
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
}

async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const { name, description, price, sortOrder, isAvailable } = req.body;
    const item = await OrderItem.create({
      shop: shop._id,
      name,
      description: description || '',
      price: Number(price),
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
      isAvailable: isAvailable !== false,
    });
    res.status(201).json({ item });
  } catch (e) {
    next(e);
  }
}

async function update(req, res, next) {
  try {
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const item = await OrderItem.findOne({
      _id: req.params.itemId,
      shop: shop._id,
    });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    const { name, description, price, sortOrder, isAvailable } = req.body;
    if (name != null) item.name = name;
    if (description != null) item.description = description;
    if (price != null) item.price = Number(price);
    if (sortOrder != null) item.sortOrder = Number(sortOrder);
    if (typeof isAvailable === 'boolean') item.isAvailable = isAvailable;
    await item.save();
    res.json({ item });
  } catch (e) {
    next(e);
  }
}

async function remove(req, res, next) {
  try {
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    await OrderItem.deleteOne({ _id: req.params.itemId, shop: shop._id });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

module.exports = { list, listPublic, create, update, remove };
