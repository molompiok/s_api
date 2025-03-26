import { DateTime } from 'luxon'
import { column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations';
import UserOrderItem from './user_order_item.js';
import BaseModel from './base_model.js';
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELED = 'canceled',
  RETURNED = 'returned',
  DELIVERED = 'delivered',
  PICKED_UP = 'picked_up',
  NOT_DELIVERED = 'not_delivered',
  NOT_PICKED_UP = 'not_picked_up',
  WAITING_FOR_PAYMENT = 'waiting_for_payment',
  WAITING_PICKED_UP = 'waiting_picked_up',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  PAYPAL = 'paypal',
  MOBILE_MONEY = 'mobile_money',
  CASH = 'cash'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
export default class UserOrder extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare store_id: string

  // Informations sur l'utilisateur
  @column()
  declare user_id: string

  @column()
  declare phone_number: string

  @column()
  declare formatted_phone_number: string

  @column()
  declare country_code: string

  // Détails de la commande
  @column()
  declare reference: string

  @column()
  declare status: OrderStatus

  @column()
  declare payment_method: PaymentMethod

  @column()
  declare payment_status: PaymentStatus

  @column()
  declare currency: string

  @column()
  declare total_price: number

  @column()
  declare delivery_price: number

  @column()
  declare return_delivery_price: number

  @column()
  declare with_delivery: boolean

  // Adresse de livraison
  @column()
  declare delivery_address: string

  @column()
  declare delivery_address_name: string

  @column.dateTime()
  declare delivery_date: DateTime

  @column()
  declare delivery_latitude: number

  @column()
  declare delivery_longitude: number

  // Adresse de retrait (pickup)
  @column()
  declare pickup_address: string

  @column()
  declare pickup_address_name: string

  @column.dateTime()
  declare pickup_date: DateTime

  @column()
  declare pickup_latitude: number

  @column()
  declare pickup_longitude: number

  // Dates de création et mise à jour
  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @hasMany(() => UserOrderItem, {
    foreignKey: 'order_id', // La clé étrangère dans UserCommandItem
    localKey: 'id',          // La clé primaire dans UserCommand
  })
  declare items: HasMany<typeof UserOrderItem>

}
