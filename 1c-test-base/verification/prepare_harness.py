from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent / 'restored'
name = 'ПроверкаAmo'
xml = '''<?xml version="1.0" encoding="UTF-8"?>
<MetaDataObject xmlns="http://v8.1c.ru/8.3/MDClasses" xmlns:v8="http://v8.1c.ru/8.1/data/core" xmlns:xr="http://v8.1c.ru/8.3/xcf/readable" version="2.17">
<ExternalDataProcessor uuid="fc25d4ca-787a-4330-91a3-15dff8f3a189">
<InternalInfo>
<xr:ContainedObject><xr:ClassId>c3831ec8-d8d5-4f93-8a22-f9bfae07327f</xr:ClassId><xr:ObjectId>7f15b78b-4e2d-44ba-af13-c73ef7c764b5</xr:ObjectId></xr:ContainedObject>
<xr:GeneratedType name="ExternalDataProcessorObject.ПроверкаAmo" category="Object"><xr:TypeId>a0fd558b-e555-411a-a848-d2297c237c5b</xr:TypeId><xr:ValueId>004dd528-40d4-4d44-962c-7fbcba2e3370</xr:ValueId></xr:GeneratedType>
</InternalInfo>
<Properties><Name>ПроверкаAmo</Name><Synonym/><Comment/><DefaultForm/><AuxiliaryForm/></Properties>
<ChildObjects/>
</ExternalDataProcessor></MetaDataObject>
'''
(root / 'harness').mkdir(exist_ok=True)
(root / 'harness' / (name + '.xml')).write_text(xml, encoding='utf-8-sig')
module = root / 'harness' / name / 'Ext' / 'ObjectModule.bsl'
module.parent.mkdir(parents=True, exist_ok=True)
original = (root.parent / 'extension' / 'TeMa_HTTPСервис.Module.bsl').read_text(encoding='utf-8-sig')
parts = []
for function in ('ЗаписатьЛогAPI', 'ОшибкаJSON', 'УспехJSON', 'УстановитьЗаголовкиCORS', 'ГенерацияУПДСоздатьУПД'):
    match = re.search(r'(?m)^(Функция|Процедура)\s+' + function + r'\(', original)
    ending = 'КонецФункции' if match[1] == 'Функция' else 'КонецПроцедуры'
    end = original.index(ending, match.start()) + len(ending)
    parts.append(original[match.start():end])
source = '\n\n'.join(parts)
# Input/output adapters only. HTTPServiceResponse is unavailable in an external
# connection, so the test stores status, headers and body in an ordinary structure.
# The handler's document, accounting, validation and register operations are intact.
source = source.replace('Запрос.ПолучитьТелоКакСтроку()', 'Запрос')
source = source.replace('Новый HTTPСервисОтвет(200)', 'Новый Структура("КодСостояния,Заголовки,Тело", 200, Новый Соответствие, "")')
source = source.replace('Ответ.УстановитьТелоИзСтроки(СтрокаОшибки);', 'Ответ.Тело = СтрокаОшибки;')
source = source.replace('Ответ.УстановитьТелоИзСтроки(ЗаписьJSON.Закрыть());', 'Ответ.Тело = ЗаписьJSON.Закрыть();')
tests = (Path(__file__).resolve().parent / 'RuntimeTests.bsl').read_text(encoding='utf-8-sig').replace('Ответ.ПолучитьТелоКакСтроку()', 'Ответ.Тело')
source += '\n' + tests
module.write_text(source, encoding='utf-8-sig')
print(module)

