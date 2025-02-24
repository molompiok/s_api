import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELED = 'canceled',
  DELIVERED = 'delivered',
  PICKED_UP = 'picked_up',
  NOT_DELIVERED = 'not_delivered',
  NOT_PICKED_UP = 'not_picked_up',
  WAITING_FOR_PAYMENT = 'waiting_for_payment',
  WAITING_PICKED_UP = 'waiting_picked_up',
  RETURNED = 'returned',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  PAYPAL = 'paypal',
  MOBILE_MONEY = 'mobile_money',
  CASH = 'cash',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
export default class UserCommand extends BaseModel {
  // Identifiant principal
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare store_id: string
  
  // Informations sur l'utilisateur
  @column()
  declare userId: string

  @column()
  declare phoneNumber: string

  @column()
  declare formattedPhoneNumber: string

  @column()
  declare countryCode: string

  // Détails de la commande
  @column()
  declare reference: string

  @column()
  declare status: OrderStatus

  @column()
  declare paymentMethod: PaymentMethod

  @column()
  declare paymentStatus: PaymentStatus

  @column()
  declare currency: string 

  @column()
  declare totalPrice: number

  @column()
  declare deliveryPrice: number

  @column()
  declare returnDeliveryPrice: number

  @column()
  declare withDelivery: boolean

  // Adresse de livraison
  @column()
  declare deliveryAddress: string

  @column()
  declare deliveryAddressName: string

  @column.dateTime()
  declare deliveryDate: DateTime

  @column()
  declare deliveryLatitude: number

  @column()
  declare deliveryLongitude: number

  // Adresse de retrait (pickup)
  @column()
  declare pickupAddress: string

  @column()
  declare pickupAddressName: string

  @column.dateTime()
  declare pickupDate: DateTime

  @column()
  declare pickupLatitude: number

  @column()
  declare pickupLongitude: number

  // Dates de création et mise à jour
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime


}
