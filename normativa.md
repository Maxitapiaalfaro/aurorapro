Resumen de Puntos Clave para tu Plataforma
Aquí se resumen los puntos más importantes de nuestra conversación, enfocados específicamente en el contexto de tu plataforma de supervisión clínica y las regulaciones que debe cumplir:
1. Marco Normativo en Chile
No te rige HIPAA: La ley HIPAA es de EE. UU. y no aplica en Chile.
Te rige la nueva ley chilena: La Ley N° 21.719 de Protección de Datos Personales, que entra en vigencia en 2026, es el marco legal que debes seguir. Esta ley se alinea con estándares internacionales como el GDPR, exigiendo un alto nivel de protección para los datos sensibles (como los de salud).
2. Tu Estrategia de Protección de Datos
Tu enfoque es sólido y cumple con principios fundamentales de la nueva ley:
Minimización y seudonimización: No almacenas ni ves datos de pacientes identificables, usando uuid para clinical_case_id y metadatos no identificables. Esto es una excelente práctica.
Protección desde el origen: El entrenamiento de tus agentes para no solicitar datos sensibles y la configuración de tu plataforma para evitar que lleguen a la IA es una medida preventiva clave.
Acuerdo con Google: Firmar un acuerdo con Google (Encargado del Tratamiento) es crucial para transferir la responsabilidad de la seguridad de la infraestructura y cumplir con la normativa.
3. Tus Responsabilidades Clave (Custodio de Datos)
Aunque no manejes datos identificables, tu plataforma no es un "dummy". Tienes responsabilidades como custodio y protector de la información seudonimizada:
Persistencia: Debes asegurar que los datos estén disponibles y no se pierdan. Esto implica implementar copias de seguridad (backups) y planes de recuperación.
Trazabilidad: Debes poder registrar y demostrar quién accedió a qué caso (clinical_case_id) y cuándo. Los logs de auditoría son obligatorios para cumplir con la nueva ley.
Cifrado: Es fundamental cifrar los datos tanto en tránsito (cuando se envían) como en reposo (cuando están almacenados).
4. Responsabilidad compartida con los Psicólogos
Tu responsabilidad: Se limita a la seguridad y la persistencia de los datos seudonimizados.
Responsabilidad del Psicólogo: El psicólogo es el "controlador" de los datos. Él es responsable de:
Obtener el consentimiento informado del paciente.
Responder a las solicitudes de acceso a la información del paciente.
Ingresar datos de forma seudonimizada en tu plataforma.
En conclusión, tu estrategia de seguridad es muy sólida. Sin embargo, para cumplir con la ley chilena, debes formalizar los acuerdos contractuales, implementar medidas de seguridad activas (como cifrado y auditorías) y asegurar la persistencia y trazabilidad de los datos.