import { FieldContext } from '@vinejs/vine/types'
import vine from '@vinejs/vine'


async function _isValidArrayJSON (
  value: unknown,
  _: undefined,
  field: FieldContext
) {
  if (typeof value !== 'string') {
    return
  }
  
  try {
    const json = JSON.parse(value);
    if(!Array.isArray(json)) return field.report(
        'The {{ field }} doit etre un tableau JSON',
        field.name.toString(),
        field
      )
  } catch (error) {
    return field.report(
        'The {{ field }} doit etre un tableau JSON',
        field.name.toString(),
        field
      )
  }
  
}
export const transformJSON = (value:string|undefined) => value ? (()=>{try{return JSON.parse(value)}catch(error){}})() : undefined

export const isValidArrayJSON = vine.createRule(_isValidArrayJSON )