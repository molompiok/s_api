import { DateTime } from 'luxon'
import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations';
import UserOrderItem from './user_order_item.js';
import BaseModel from './base_model.js';
import User from './user.js';
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

export  enum CURRENCY{
  FCFA= 'CFA'
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

export type EventStatus = {
  change_at:DateTime,
  status:OrderStatus,
  estimated_duration?:number,
  message?:string,
  user_role:'client'|'admin'|'owner'|'collaborator'|'supervisor',
  user_provide_change_id:string
}
export default class UserOrder extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  // Informations sur l'utilisateur
  @column()
  declare user_id: string

  @column()
  declare phone_number: string

  @column()
  declare formatted_phone_number: string

  @column()
  declare country_code: string

  @column()
  declare items_count: number

  // Détails de la commande
  
  @column()
  declare reference: string

  @column()
  declare status: OrderStatus

  @column({
    prepare:(value)=>{
      try {
        if(!Array.isArray(value)){
          throw new Error('command.events_status n\'est pas valid, \n'+value)
        }
        return JSON.stringify(value)
      } catch (error) {
        throw new Error('command.events_status n\'est pas valid, \n'+value)
      }
    }
  })
  declare events_status: EventStatus[]

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
 
  @belongsTo(() => User, {
    foreignKey: 'user_id', // ✅ La clé étrangère doit être `user_id` dans `Order`
  })
  declare user: BelongsTo<typeof User>

}
